/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ELECTIONS, findElection } from "./lib/elections";
import { colorForCandidate, sequentialColor, SEQUENTIAL_STEPS } from "./lib/color";
import { nuanceInfo } from "./lib/nuances";
import type { ElectionCircoFile, ElectionCommuneFile, MetricId, Scale, UnitResult } from "./lib/types";
import electionSources from "../config/election-sources.json";

const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") || "";
const ATLAS_URL = "https://ddt95.github.io/atlas-territorial-95/";

type SourceEntry = { id: string; label: string; producer: string; url: string; frequency: string };
type SocioProfile = { population: number; jeunes: number; seniors: number; diplomesSup: number };
type ElectionSnapshot = { key: string; election: string; tour: string; date: string; result: UnitResult };
type DisplayMetric = MetricId | "none";

function aggregateSocio(data: any): Record<string, SocioProfile> {
  const totals: Record<string, Record<string, number>> = {};
  Object.entries(data?.bureaux ?? {}).forEach(([bureau, raw]) => {
    const code = bureau.slice(0, 5);
    const values = raw as Record<string, number>;
    const target = totals[code] ?? (totals[code] = {});
    Object.entries(values).forEach(([key, value]) => { target[key] = (target[key] ?? 0) + (Number(value) || 0); });
  });
  return Object.fromEntries(Object.entries(totals).map(([code, value]) => [code, {
    population: value.P_POP ?? 0,
    jeunes: value.P_POP ? ((value.P_POP1524 ?? 0) * 100) / value.P_POP : 0,
    seniors: value.P_POP ? (((value.P_POP6579 ?? 0) + (value.P_POP80P ?? 0)) * 100) / value.P_POP : 0,
    diplomesSup: value.P_NSCOL15P ? (((value.P_NSCOL15P_SUP2 ?? 0) + (value.P_NSCOL15P_SUP34 ?? 0) + (value.P_NSCOL15P_SUP5 ?? 0)) * 100) / value.P_NSCOL15P : 0,
  }]));
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${basePath}${path}`);
  if (!res.ok) throw new Error(`Échec de chargement : ${path}`);
  return res.json();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
const EMPTY_MAP_COLOR = "#dbe3e8";

function aggregateDepartment(file: ElectionCommuneFile): UnitResult {
  const units = Object.values(file.communes);
  const totals = units.reduce((a, u) => ({ inscrits:a.inscrits+u.inscrits, abstentions:a.abstentions+u.abstentions, votants:a.votants+u.votants, blancs:a.blancs+u.blancs, nuls:a.nuls+u.nuls, exprimes:a.exprimes+u.exprimes }), {inscrits:0,abstentions:0,votants:0,blancs:0,nuls:0,exprimes:0});
  const candidateMap = new Map<string, {nom:string|null;prenom:string|null;nuance:string|null;voix:number}>();
  units.forEach(u => u.candidats.forEach(c => { const key=`${c.nom}|${c.prenom}|${c.nuance}`; const item=candidateMap.get(key)??{nom:c.nom,prenom:c.prenom,nuance:c.nuance,voix:0}; item.voix+=c.voix; candidateMap.set(key,item); }));
  const candidats = [...candidateMap.values()].map(c => ({...c,pct_exprimes:totals.exprimes?c.voix*100/totals.exprimes:0,pct_inscrits:totals.inscrits?c.voix*100/totals.inscrits:0})).sort((a,b)=>b.voix-a.voix);
  return {nom:"Val-d'Oise",...totals,pct_abstention:totals.inscrits?totals.abstentions*100/totals.inscrits:0,pct_participation:totals.inscrits?totals.votants*100/totals.inscrits:0,candidats,tete:candidats[0]?{nom:candidats[0].nom,prenom:candidats[0].prenom,nuance:candidats[0].nuance,pct_exprimes:candidats[0].pct_exprimes}:undefined};
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const METRICS: { id: MetricId; label: string }[] = [
  { id: "tete", label: "Parti/candidat arrivé en tête" },
  { id: "score_candidat", label: "Score d'un candidat" },
  { id: "abstention", label: "Abstention" },
  { id: "participation", label: "Participation" },
];

const SCALES: { id: Scale; label: string }[] = [
  { id: "commune", label: "Commune" },
  { id: "bv", label: "Bureau de vote" },
  { id: "epci", label: "EPCI" },
  { id: "canton", label: "Canton" },
  { id: "circonscription", label: "Circonscription" },
];

export default function ElectionsPage() {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const initialBoundsRef = useRef<any>(null);
  // code -> layer Leaflet pour l'échelle actuellement affichée, et fonctions de style associées
  // (base / survol / sélection), utilisées à la fois à la construction de la couche et pour
  // appliquer/retirer le halo persistant de sélection sans reconstruire toute la couche.
  const layersByCodeRef = useRef<Record<string, any>>({});
  const styleFnsRef = useRef<{ base: (code: string) => any; hover: (code: string) => any; selected: (code: string) => any } | null>(null);
  const selectedCodeRef = useRef<string | null>(null);

  const [scale, setScale] = useState<Scale>("commune");
  const [electionId, setElectionId] = useState("pres-2022");
  const [tourId, setTourId] = useState("t2");
  // Le menu Élection/Tour démarre sans choix visible ("—") tant que l'utilisateur n'a rien
  // sélectionné, pour que la carte neutre au chargement (metric = "none") se comprenne : rien
  // n'est affiché sur la carte parce que rien n'a encore été choisi. electionId/tourId gardent
  // en interne une valeur par défaut (données déjà prêtes en arrière-plan dès le premier choix).
  const [hasChosenScrutin, setHasChosenScrutin] = useState(false);
  const [metric, setMetric] = useState<DisplayMetric>("none");
  const [scoreCandidat, setScoreCandidat] = useState<string>("");

  const [communesGeo, setCommunesGeo] = useState<any>(null);
  const [circoGeo, setCircoGeo] = useState<any>(null);
  const [bvGeo, setBvGeo] = useState<any>(null);
  const [cantonGeo, setCantonGeo] = useState<any>(null);
  const [epciGeo, setEpciGeo] = useState<any>(null);
  const [communeEpci, setCommuneEpci] = useState<Record<string,string>>({});
  const [maskGeo, setMaskGeo] = useState<any>(null);
  const [electionData, setElectionData] = useState<Record<string, ElectionCommuneFile>>({});
  const [circoData, setCircoData] = useState<Record<string, ElectionCircoFile>>({});
  const [cantonData, setCantonData] = useState<Record<string, any>>({});
  const [bvData, setBvData] = useState<Record<string, any>>({});
  const [populationData, setPopulationData] = useState<Record<string, { annee: number; population: number }[]>>({});
  const [socioData, setSocioData] = useState<Record<string, SocioProfile>>({});
  const [allElectionData, setAllElectionData] = useState<Record<string, ElectionCommuneFile>>({});

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<{ name: string; result: UnitResult | null } | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const sourceDialog = useRef<HTMLDialogElement>(null);
  const departmentDialog = useRef<HTMLDialogElement>(null);

  const election = findElection(electionId);
  const tour = election.tours.find((t) => t.id === tourId) ?? election.tours[0];
  const dataKey = tour.file;
  const current = electionData[dataKey];
  const tourStatus: "publie" | "a_completer" = current?.status ?? election.status;

  // ---- Chargement des données statiques ----
  useEffect(() => {
    setSources(electionSources as SourceEntry[]);
    Promise.all([
      fetchJson<any>("/data/geo/communes-95.geojson"),
      fetchJson<any>("/data/geo/circonscriptions-95.geojson"),
      fetchJson<any>("/data/geo/bureaux-vote-95.geojson").catch(() => null),
      fetchJson<any>("/data/geo/cantons-95.geojson").catch(() => null),
      fetchJson<any>("/data/geo/epcis-95.geojson").catch(() => null),
      fetchJson<any[]>("/data/geo/communes-epci-95.json").catch(() => []),
      fetchJson<any>("/data/geo/masque-95.geojson").catch(() => null),
      fetchJson<any>("/data/insee/context-95.json").catch(() => null),
      fetchJson<any>("/data/insee/population-historique-95.json").catch(() => null),
    ])
      .then(([communes, circo, bv, canton, epci, epciLinks, mask, insee, population]) => {
        setCommunesGeo(communes);
        setCircoGeo(circo);
        setBvGeo(bv);
        setCantonGeo(canton);
        setEpciGeo(epci);
        setCommuneEpci(Object.fromEntries(epciLinks.map(item=>[item.code,item.codeEpci])));
        setMaskGeo(mask);
        setSocioData(aggregateSocio(insee));
        setPopulationData(population?.communes || {});
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (electionData[dataKey]) return;
    fetchJson<ElectionCommuneFile>(`/data/elections/${dataKey}.json`)
      .then((d) => setElectionData((prev) => ({ ...prev, [dataKey]: d })))
      .catch(() => {});
  }, [dataKey]);

  useEffect(() => {
    const tours = ELECTIONS.flatMap((item) => item.tours.map((itemTour) => ({ election: item, tour: itemTour })));
    Promise.all(tours.map(async ({ tour: itemTour }) => [itemTour.file, await fetchJson<ElectionCommuneFile>(`/data/elections/${itemTour.file}.json`), await fetchJson<any>(`/data/elections/${itemTour.file}-canton.json`).catch(()=>null), await fetchJson<ElectionCircoFile>(`/data/elections/${itemTour.file}-circo.json`).catch(()=>null)] as const))
      .then((entries) => { setAllElectionData(Object.fromEntries(entries.map(([key,file])=>[key,file]))); setCantonData(prev=>({...prev,...Object.fromEntries(entries.map(([key,,file])=>[`${key}-canton`,file]))})); setCircoData(prev=>({...prev,...Object.fromEntries(entries.flatMap(([key,,,file])=>file?[[`${key}-circo`,file]]:[])) as Record<string,ElectionCircoFile>})); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const circoKey = `${dataKey}-circo`;
    if (circoData[circoKey] || election.status !== "publie") return;
    fetchJson<ElectionCircoFile>(`/data/elections/${dataKey}-circo.json`)
      .then((d) => setCircoData((prev) => ({ ...prev, [circoKey]: d })))
      .catch(() => {});
  }, [dataKey, election.status]);

  useEffect(() => {
    const cantonKey = `${dataKey}-canton`;
    if (cantonData[cantonKey] !== undefined || election.status !== "publie") return;
    fetchJson<any>(`/data/elections/${dataKey}-canton.json`)
      .then((d) => setCantonData((prev) => ({ ...prev, [cantonKey]: d })))
      .catch(() => setCantonData((prev) => ({ ...prev, [cantonKey]: null })));
  }, [dataKey, election.status]);

  useEffect(() => {
    if (election.status !== "publie") return;
    const bvKey = `${dataKey}-bv`;
    if (bvData[bvKey] || bvData[bvKey] === null) return;
    fetchJson<any>(`/data/elections/${dataKey}-bv.json`)
      .then((d) => setBvData((prev) => ({ ...prev, [bvKey]: d })))
      .catch(() => setBvData((prev) => ({ ...prev, [bvKey]: null })));
  }, [dataKey, election.status]);

  // Normalise un enregistrement "bureau" (schéma brut) vers un UnitResult exploitable par
  // les mêmes fonctions (metricInfo, CandidateTable, fiche…) que commune/circonscription.
  function normalizeBureau(b: any): UnitResult {
    const inscrits = b.inscrits || 1;
    const exprimes = b.exprimes || 1;
    const cands = (b.candidats || []).map((c: any) => ({
      ...c,
      pct_exprimes: c.pct_exprimes ?? round2((c.voix * 100) / exprimes),
      pct_inscrits: c.pct_inscrits ?? round2((c.voix * 100) / inscrits),
    }));
    return {
      code_insee: b.code_insee,
      nom: `${b.nom_commune ?? ""} — bureau ${b.code_bv ?? ""}`,
      code_circonscription: b.code_circonscription ?? null,
      inscrits: b.inscrits,
      abstentions: b.abstentions,
      votants: b.votants,
      blancs: b.blancs,
      nuls: b.nuls,
      exprimes: b.exprimes,
      pct_abstention: b.pct_abstention ?? round2((b.abstentions * 100) / inscrits),
      pct_participation: b.pct_participation ?? round2((b.votants * 100) / inscrits),
      candidats: cands,
      tete: cands[0] ? { nom: cands[0].nom, prenom: cands[0].prenom, nuance: cands[0].nuance, pct_exprimes: cands[0].pct_exprimes } : undefined,
    };
  }

  // Liste des candidats disponibles pour l'élection courante (pour le sélecteur "score d'un candidat")
  const candidateList = useMemo(() => {
    if (!current) return [];
    const set = new Map<string, string>();
    Object.values(current.communes).forEach((c) =>
      c.candidats.forEach((cd) => {
        const key = `${cd.nom}|${cd.prenom}`;
        if (!set.has(key)) set.set(key, `${cd.prenom ?? ""} ${cd.nom ?? ""}`.trim());
      }),
    );
    return Array.from(set.entries());
  }, [current]);

  useEffect(() => {
    if (candidateList.length && !candidateList.find(([k]) => k === scoreCandidat)) {
      setScoreCandidat(candidateList[0][0]);
    }
  }, [candidateList]);

  const metricRange = useMemo<[number, number]>(() => {
    if (!current || metric === "tete" || metric === "none") return [0, 100];
    const values = Object.values(current.communes).map((unit) => {
      if (metric === "abstention") return unit.pct_abstention;
      if (metric === "participation") return unit.pct_participation;
      const [nom, prenom] = scoreCandidat.split("|");
      return unit.candidats.find((candidate) => candidate.nom === nom && candidate.prenom === prenom)?.pct_exprimes ?? 0;
    }).filter(Number.isFinite);
    const min = Math.floor(Math.min(...values));
    const max = Math.ceil(Math.max(...values));
    return min === max ? [min - 1, max + 1] : [min, max];
  }, [current, metric, scoreCandidat]);

  // ---- Initialisation Leaflet ----
  // Leaflet est importé comme module ES (voir l'import en tête de fichier) et donc intégré au
  // bundle JS/CSS de l'application, plutôt que chargé depuis unpkg via une balise <script>
  // injectée à l'exécution : sur un réseau qui bloque les CDN publics (constaté dans
  // l'environnement de développement de cette session lui-même, voir DATA.md), un chargement
  // dépendant d'unpkg ne se termine jamais et la carte reste vierge en permanence à l'ouverture,
  // même avec le correctif mapReady ci-dessous (qui rejoue l'effet une fois la carte prête, mais
  // ne peut rien si le script Leaflet lui-même n'arrive jamais). En bundlant Leaflet, il n'y a
  // plus aucune requête réseau externe à attendre pour que `L` soit disponible.
  useEffect(() => {
    const start = () => {
      if (mapRef.current || !mapNode.current) return;
      if (mapNode.current.offsetWidth === 0) {
        requestAnimationFrame(start);
        return;
      }
      const bounds = L.latLngBounds([
        [48.89, 1.6],
        [49.25, 2.6],
      ]);
      initialBoundsRef.current = bounds;
      const map = L.map(mapNode.current, { zoomControl: false, minZoom: 9, maxBoundsViscosity: 0.6 }).fitBounds(
        bounds,
        { padding: [8, 8], animate: false },
      );
      mapRef.current = map;
      map.setMaxBounds(bounds.pad(0.3));
      L.control.zoom({ position: "bottomright" }).addTo(map);
      setMapReady((n) => n + 1);
    };
    start();
  }, []);

  // Incrémenté une fois que la carte Leaflet est prête (script chargé + conteneur mesurable).
  // Doit être lu par l'effet de rendu de la couche choroplèthe (sinon celui-ci, qui se déclenche
  // par ailleurs sur l'arrivée asynchrone des géométries/résultats, peut avoir déjà tenté — et
  // abandonné faute de carte prête — tous ses passages avant que Leaflet ne finisse de charger ;
  // sans ce signal en dépendance, aucun de ses effets ultérieurs ne le redéclenche et la carte
  // reste vide indéfiniment, même si toutes les données sont là).
  const [mapReady, setMapReady] = useState(0);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !maskGeo || !mapReady) return;
    if (!map.getPane("outside-mask")) {
      const pane = map.createPane("outside-mask");
      pane.style.zIndex = "350";
      pane.style.pointerEvents = "none";
    }
    const mask = L.geoJSON(maskGeo, {
      pane: "outside-mask",
      interactive: false,
      style: { stroke: false, fillColor: "#e7ebee", fillOpacity: 0.92 },
    }).addTo(map);
    return () => {
      mask.remove();
    };
  }, [maskGeo, mapReady]);

  // ---- Détermination des valeurs par unité selon métrique ----
  function metricInfo(u: UnitResult): { value: number | null; color: string; label: string } {
    if (metric === "none") return { value: null, color: "#dbe3e8", label: "Carte non colorée" };
    if (metric === "tete") {
      const t = u.tete;
      if (!t) return { value: null, color: "#c7cfda", label: "—" };
      const tendency=politicalGroup(t.nuance,`${t.prenom??""} ${t.nom??""}`).sensitivity;
      const tendencyColor:Record<string,string>={extreme_left:"#7a0c0c",left:"#e4287c",center:"#e8b62f",right:"#2878c8",far_right:"#14213d",other:"#8b95a3"};
      return {
        value: t.pct_exprimes,
        color: tendencyColor[tendency]??"#8b95a3",
        label: `${t.prenom ?? ""} ${t.nom ?? ""} · ${t.pct_exprimes.toFixed(1)} %`,
      };
    }
    if (metric === "score_candidat") {
      const [nom, prenom] = scoreCandidat.split("|");
      const cd = u.candidats.find((c) => c.nom === nom && c.prenom === prenom);
      if (!cd) return { value: null, color: "#e6e9ef", label: "—" };
      return { value: cd.pct_exprimes, color: sequentialColor(cd.pct_exprimes, metricRange[0], metricRange[1]), label: `${cd.pct_exprimes.toFixed(1)} %` };
    }
    if (metric === "abstention") {
      return { value: u.pct_abstention, color: sequentialColor(u.pct_abstention, metricRange[0], metricRange[1]), label: `${u.pct_abstention.toFixed(1)} %` };
    }
    return { value: u.pct_participation, color: sequentialColor(u.pct_participation, metricRange[0], metricRange[1]), label: `${u.pct_participation.toFixed(1)} %` };
  }

  // ---- Rendu de la couche choroplèthe ----
  useEffect(() => {
    const map = mapRef.current;
    // Tant que la carte n'est pas prête, on ne peut rien construire ; cet effet sera rejoué
    // automatiquement dès que mapReady passera à une valeur non nulle (cf. dépendances
    // ci-dessous), donc l'abandon ici est temporaire et non définitif.
    if (!map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    layersByCodeRef.current = {};
    styleFnsRef.current = null;

    // Style de base (repos), survol (aperçu léger au passage de la souris) et sélection
    // (halo persistant tant que la fiche est ouverte pour cette unité). Le survol et la
    // sélection restent visuellement distincts, mais sans contour bleu vif (jugé trop
    // marqué sur la carte neutre) : gris foncé discret au survol, noir épais et pointillé
    // pour la sélection persistante.
    function withHover(base: any) {
      return { ...base, color: "#4b5563", weight: base.weight + 1.2 };
    }
    function withSelected(base: any) {
      return { ...base, color: "#17202a", weight: base.weight + 2.2, dashArray: "5,3", opacity: 1 };
    }

    function wireFeature(code: string, lyr: any, name: string, result: UnitResult | null) {
      layersByCodeRef.current[code] = lyr;
      lyr.on("click", () => setSelectedCode(code));
      lyr.on("mouseover", () => {
        setHoveredUnit({ name, result });
        if (selectedCodeRef.current !== code) lyr.setStyle(styleFnsRef.current!.hover(code));
      });
      lyr.on("mouseout", () => {
        setHoveredUnit(null);
        lyr.setStyle(selectedCodeRef.current === code ? styleFnsRef.current!.selected(code) : styleFnsRef.current!.base(code));
      });
    }

    if (scale === "canton") {
      const cantons = cantonData[`${dataKey}-canton`]?.cantons;
      if (!cantonGeo || !cantons) return;
      const base = (code: string) => {
        const u = cantons[code];
        const info = u ? metricInfo(u) : null;
        return { color: "#fff", weight: 1.6, fillColor: metric === "none" ? EMPTY_MAP_COLOR : info?.color ?? "#e9edf3", fillOpacity: 0.82 };
      };
      styleFnsRef.current = { base, hover: (c) => withHover(base(c)), selected: (c) => withSelected(base(c)) };
      const layer = L.geoJSON(cantonGeo, {
        style: (feature: any) => {
          const code = feature.properties.code_canton;
          return code === selectedCodeRef.current ? withSelected(base(code)) : base(code);
        },
        onEachFeature: (feature: any, lyr: any) => {
          const code = feature.properties.code_canton;
          const u = cantons[code];
          const name = feature.properties.nom;
          wireFeature(code, lyr, `Canton de ${name}`, u ?? null);
        },
      }).addTo(map);
      layerRef.current = layer;
      return;
    }
    if (scale === "epci") {
      if (!epciGeo || !current) return;
      const results=Object.fromEntries(epciGeo.features.map((feature:any)=>{const code=feature.properties.code,communes=Object.fromEntries(Object.entries(current.communes).filter(([commune])=>communeEpci[commune]===code));return [code,Object.keys(communes).length?aggregateDepartment({...current,communes}):null]}));
      const base=(code:string)=>{const u=results[code],info=u?metricInfo(u):null;return {color:"#fff",weight:1.8,fillColor:metric==="none"?EMPTY_MAP_COLOR:info?.color??"#e9edf3",fillOpacity:.84}};
      styleFnsRef.current={base,hover:c=>withHover(base(c)),selected:c=>withSelected(base(c))};
      layerRef.current=L.geoJSON(epciGeo,{style:(feature:any)=>{const code=feature.properties.code;return code===selectedCodeRef.current?withSelected(base(code)):base(code)},onEachFeature:(feature:any,lyr:any)=>{const code=feature.properties.code;wireFeature(code,lyr,feature.properties.name,results[code])}}).addTo(map);return;
    }
    if (scale === "bv") {
      const bvBureaux = bvData[`${dataKey}-bv`]?.bureaux;
      if (!bvGeo || !bvBureaux) return;
      const base = (code: string) => {
        const b = bvBureaux[code];
        const info = b ? metricInfo(normalizeBureau(b)) : null;
        return { color: "#fff", weight: 0.5, fillColor: info?.color ?? "#e9edf3", fillOpacity: info ? 0.82 : 0.35 };
      };
      styleFnsRef.current = { base, hover: (c) => withHover(base(c)), selected: (c) => withSelected(base(c)) };
      const layer = L.geoJSON(bvGeo, {
        style: (feature: any) => {
          const code = feature.properties.codeBureauVote;
          return code === selectedCodeRef.current ? withSelected(base(code)) : base(code);
        },
        onEachFeature: (feature: any, lyr: any) => {
          const code = feature.properties.codeBureauVote;
          const b = bvBureaux[code];
          const name = `${feature.properties.nomCommune} — bureau ${feature.properties.numeroBureauVote}`;
          wireFeature(code, lyr, name, b ? normalizeBureau(b) : null);
        },
      }).addTo(map);
      layerRef.current = layer;
      return;
    }
    const geo = scale === "circonscription" ? circoGeo : communesGeo;
    const dataset = scale === "circonscription" ? circoData[`${dataKey}-circo`]?.circonscriptions : current?.communes;
    if (!geo || !dataset) return;

    const baseWeight = scale === "circonscription" ? 1.4 : 0.8;
    const base = (code: string) => {
      const u = dataset[code];
      const info = u ? metricInfo(u) : { color: "#e9edf3" };
      return { color: "#fff", weight: baseWeight, fillColor: metric === "none" ? EMPTY_MAP_COLOR : info.color, fillOpacity: 0.82 };
    };
    styleFnsRef.current = { base, hover: (c) => withHover(base(c)), selected: (c) => withSelected(base(c)) };
    const layer = L.geoJSON(geo, {
      style: (feature: any) => {
        const code = scale === "circonscription" ? feature.properties.code_circonscription : feature.properties.code;
        return code === selectedCodeRef.current ? withSelected(base(code)) : base(code);
      },
      onEachFeature: (feature: any, lyr: any) => {
        const code = scale === "circonscription" ? feature.properties.code_circonscription : feature.properties.code;
        const u = dataset[code];
        const name = feature.properties.nom;
        wireFeature(code, lyr, name, u ?? null);
      },
    }).addTo(map);
    layerRef.current = layer;
  }, [scale, communesGeo, circoGeo, epciGeo, communeEpci, bvGeo, bvData, cantonGeo, cantonData, current, circoData, dataKey, metric, scoreCandidat, mapReady]);

  // Garde selectedCodeRef synchronisé (lu par les gestionnaires mouseover/mouseout ci-dessus,
  // qui sont attachés une seule fois par construction de couche et ne doivent pas figer
  // l'ancienne sélection) et applique/retire le halo de sélection persistant sans reconstruire
  // toute la couche géographique à chaque clic.
  useEffect(() => {
    const prev = selectedCodeRef.current;
    selectedCodeRef.current = selectedCode;
    const fns = styleFnsRef.current;
    if (!fns) return;
    if (prev && prev !== selectedCode && layersByCodeRef.current[prev]) {
      layersByCodeRef.current[prev].setStyle(fns.base(prev));
    }
    if (selectedCode && layersByCodeRef.current[selectedCode]) {
      layersByCodeRef.current[selectedCode].setStyle(fns.selected(selectedCode));
    }
  }, [selectedCode]);

  const selectedUnit: UnitResult | null = useMemo(() => {
    if (!selectedCode) return null;
    if (scale === "circonscription") return circoData[`${dataKey}-circo`]?.circonscriptions[selectedCode] ?? null;
    if (scale === "epci" && current) { const communes=Object.fromEntries(Object.entries(current.communes).filter(([code])=>communeEpci[code]===selectedCode)); if(!Object.keys(communes).length)return null; const result=aggregateDepartment({...current,communes}); result.nom=epciGeo?.features?.find((f:any)=>f.properties.code===selectedCode)?.properties.name??selectedCode; return result; }
    if (scale === "bv") {
      const b = bvData[`${dataKey}-bv`]?.bureaux?.[selectedCode];
      return b ? normalizeBureau(b) : null;
    }
    if (scale === "canton") return cantonData[`${dataKey}-canton`]?.cantons?.[selectedCode] ?? null;
    return current?.communes[selectedCode] ?? null;
  }, [selectedCode, scale, current, circoData, bvData, cantonData, dataKey, communeEpci, epciGeo]);

  const drawerOpen = !!selectedUnit;
  const selectedSocio = scale === "commune" && selectedCode ? socioData[selectedCode] : null;
  const communeSnapshots = useMemo<ElectionSnapshot[]>(() => {
    if (scale !== "commune" || !selectedCode) return [];
    return ELECTIONS.flatMap((item) => item.tours.flatMap((itemTour) => {
      const file = allElectionData[itemTour.file];
      const result = file?.communes[selectedCode];
      return result ? [{ key: itemTour.file, election: item.shortLabel, tour: itemTour.label, date: file.date, result }] : [];
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [allElectionData, scale, selectedCode]);
  const scaleSnapshots = useMemo<ElectionSnapshot[]>(() => {
    if (!selectedCode) return [];
    return ELECTIONS.flatMap(item => item.tours.flatMap(itemTour => {
      const file=allElectionData[itemTour.file];
      if (!file) return [];
      if (scale === "commune") { const result=file.communes[selectedCode]; return result?[{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result}]:[]; }
      if (scale === "epci") { const communes=Object.fromEntries(Object.entries(file.communes).filter(([code])=>communeEpci[code]===selectedCode)); if(!Object.keys(communes).length)return []; return [{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result:aggregateDepartment({...file,communes})}]; }
      if (scale !== "canton" && scale !== "circonscription") return [];
      const result = scale === "canton" ? cantonData[`${itemTour.file}-canton`]?.cantons?.[selectedCode] : circoData[`${itemTour.file}-circo`]?.circonscriptions?.[selectedCode];
      if (!result) return [];
      return [{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result}];
    })).sort((a,b)=>a.date.localeCompare(b.date));
  }, [allElectionData, cantonData, circoData, communeEpci, scale, selectedCode]);
  const departmentSnapshots = useMemo<ElectionSnapshot[]>(() => ELECTIONS.flatMap(item => item.tours.flatMap(itemTour => { const file=allElectionData[itemTour.file]; return file?[{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result:aggregateDepartment(file)}]:[]; })).sort((a,b)=>a.date.localeCompare(b.date)), [allElectionData]);
  const departmentSocio = useMemo<SocioProfile | null>(() => { const values=Object.values(socioData); const population=values.reduce((s,v)=>s+v.population,0); if(!population)return null; return {population,jeunes:values.reduce((s,v)=>s+v.jeunes*v.population,0)/population,seniors:values.reduce((s,v)=>s+v.seniors*v.population,0)/population,diplomesSup:values.reduce((s,v)=>s+v.diplomesSup*v.population,0)/population}; }, [socioData]);
  // Députés élus aux Législatives 2024 : 2nd tour par défaut, complété par le 1er tour pour les
  // 2 circonscriptions où un·e candidat·e a obtenu la majorité absolue dès le 1er tour (pas de
  // second tour organisé pour elles — données réelles des deux tours, jamais un candidat inventé).
  const deputies = useMemo<Record<string, UnitResult> | null>(() => {
    const t1 = circoData["legislatives-2024-t1-circo"]?.circonscriptions;
    const t2 = circoData["legislatives-2024-t2-circo"]?.circonscriptions;
    if (!t1 && !t2) return null;
    return { ...(t1 ?? {}), ...(t2 ?? {}) };
  }, [circoData]);
  const averageCommuneParticipation = scaleSnapshots.length ? scaleSnapshots.reduce((sum,snapshot)=>sum+snapshot.result.pct_participation,0)/scaleSnapshots.length : 0;
  const latestScaleSnapshot = scaleSnapshots.at(-1) ?? null;
  function resetSelection() {
    setSelectedCode(null);
  }

  function recenter() {
    if (mapRef.current && initialBoundsRef.current) {
      mapRef.current.fitBounds(initialBoundsRef.current, { padding: [8, 8] });
    }
  }

  // ---- Export GeoJSON ----
  function layerGeoOf(): any {
    if (scale === "circonscription") return circoGeo;
    if (scale === "epci") return epciGeo;
    if (scale === "bv") return bvGeo;
    if (scale === "canton") return cantonGeo;
    return communesGeo;
  }
  function layerDatasetOf(): Record<string, UnitResult> | undefined {
    if (scale === "circonscription") return circoData[`${dataKey}-circo`]?.circonscriptions;
    if (scale === "bv") return bvData[`${dataKey}-bv`]?.bureaux;
    if (scale === "canton") return cantonData[`${dataKey}-canton`]?.cantons;
    return current?.communes;
  }
  function layerGeoAndCodeOf(f: any): string {
    if (scale === "circonscription") return f.properties.code_circonscription;
    if (scale === "epci") return f.properties.code;
    if (scale === "bv") return f.properties.codeBureauVote;
    if (scale === "canton") return f.properties.code_canton;
    return f.properties.code;
  }

  function exportLayerGeoJSON() {
    const geo = layerGeoOf();
    if (!geo) return;
    const dataset = layerDatasetOf();
    const enriched = {
      ...geo,
      features: geo.features.map((f: any) => {
        const code = layerGeoAndCodeOf(f);
        const u = dataset?.[code];
        return { ...f, properties: { ...f.properties, resultats: u ?? null } };
      }),
    };
    downloadBlob(`${scale}-${dataKey}.geojson`, JSON.stringify(enriched), "application/geo+json");
  }

  // ---- Impression ----
  // Le PDF montre toujours le scrutin le plus récent disponible (dernier élément de
  // scaleSnapshots/departmentSnapshots, triés par date), jamais le scrutin actuellement
  // sélectionné dans le menu Élection/Tour : ce menu ne pilote que la couleur de la carte
  // (cf. Participation/CommuneSynthesis ci-dessus, même logique).
  function printUnit() {
    if (!selectedUnit) return;
    const latest = scaleSnapshots.at(-1);
    const token = crypto.randomUUID();
    localStorage.setItem(
      `elections-print-${token}`,
      JSON.stringify({
        unit: latest?.result ?? selectedUnit,
        election: latest ? `${latest.election} · ${latest.tour}` : `${election.label} · ${tour.label}`,
        scale: SCALES.find((item) => item.id === scale)?.label ?? scale,
        coverage: 1,
        source: electionSources,
        snapshots: scaleSnapshots,
        currentKey: latest?.key ?? dataKey,
        socio: selectedSocio,
        populationHistory: selectedCode ? populationData[selectedCode] ?? [] : [],
        date: new Date().toISOString(),
      }),
    );
    window.open(`${basePath}/print.html#${token}`, "_blank", "noopener");
  }
  function printDepartment(){
    const latest=departmentSnapshots.at(-1);const unit=latest?.result;if(!unit)return;
    const token=crypto.randomUUID();
    const scenarios=buildDepartmentScenarios(allElectionData["europeennes-2024"]?.communes??{},allElectionData,socioData);
    // Mêmes élus que la fiche web (Section "Députés élus"/"Sénateurs"/"Conseil départemental" de
    // DepartmentAnalysis) : sérialisés ici en tableaux simples pour print.js, qui n'a pas accès
    // aux composants React ni aux fichiers de résultats bruts.
    const deputiesList=deputies?Object.values(deputies).filter(c=>c.tete).map(c=>({nom:c.tete!.nom??"—",prenom:c.tete!.prenom,nuance:c.tete!.nuance,subtitle:c.nom})):[];
    const councillorsData=cantonData["departementales-2021-t2-canton"]?.cantons as Record<string,UnitResult>|undefined;
    const councillorsList=councillorsData?Object.values(councillorsData).filter(c=>c.tete).map(c=>({nom:c.tete!.nom??"—",prenom:null,nuance:c.tete!.nuance,subtitle:c.nom})):[];
    const senatorsList=SENATORS.map(s=>({nom:s.nom,prenom:s.prenom,nuance:s.nuance}));
    localStorage.setItem(`elections-print-${token}`,JSON.stringify({unit,election:`${latest.election} · ${latest.tour}`,scale:"Département",snapshots:departmentSnapshots,currentKey:latest.key,socio:departmentSocio,populationHistory:[],scenarios,deputies:deputiesList,senators:senatorsList,councillors:councillorsList,date:new Date().toISOString()}));
    window.open(`${basePath}/print.html#${token}`,"_blank","noopener");
  }

  return (
    <main className="elec-page">
      <header className="elec-header">
        <a href={ATLAS_URL} target="_blank" rel="noreferrer" aria-label="Ouvrir l'Atlas territorial du Val-d'Oise" className="elec-header-logo">
          <img src={`${basePath}/prefet-val-doise-logo.png`} alt="Préfet du Val-d'Oise" />
        </a>
        <div className="elec-header-copy">
          <span>ATLAS ÉLECTORAL</span>
          <h1>Atlas électoral du Val-d'Oise</h1>
          <p>Résultats, participation et profil sociodémographique — communes et département</p>
        </div>
      </header>
      <div className="elec-progress">
        <span style={{ width: loading ? "40%" : "100%" }} />
      </div>
      <div className="elec-workspace">
        <aside className="elec-sidebar">
          <div className="elec-sidebar-intro">
            <span>LECTURE DE LA CARTE</span>
            <h2>Explorer les résultats</h2>
          </div>

          <div className="elec-primary-tools">
            <button type="button" onClick={recenter}>Recentrer</button>
            <button type="button" className="analysis" onClick={() => departmentDialog.current?.showModal()}>Analyse départementale</button>
          </div>

          <div className="elec-select-group">
            <div className="elec-sidebar-block-title">Élection et tour</div>
            <select
              className="elec-select"
              value={hasChosenScrutin ? electionId : ""}
              onChange={(e) => {
                setElectionId(e.target.value);
                const el = findElection(e.target.value);
                setTourId(el.tours[el.tours.length - 1].id);
                setMetric("tete");
                setHasChosenScrutin(true);
                resetSelection();
              }}
            >
              <option value="" disabled hidden>-----</option>
              {ELECTIONS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {e.status === "a_completer" ? " (à compléter)" : ""}
                </option>
              ))}
            </select>
            <select
              className="elec-select"
              value={hasChosenScrutin ? tourId : ""}
              onChange={(e) => {
                setTourId(e.target.value);
                setMetric("tete");
                setHasChosenScrutin(true);
                resetSelection();
              }}
            >
              <option value="" disabled hidden>-----</option>
              {election.tours.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {tourStatus === "a_completer" && (
            <p className="elec-scale-note warn">
              Les résultats officiels ne sont pas disponibles pour ce tour.
            </p>
          )}

          <button type="button" className="elec-sources-button" onClick={() => sourceDialog.current?.showModal()}>
            Sources, millésimes et licences
          </button>
          <div className="elec-sidebar-status">
            <i />
            <span>
              <strong>Val-d'Oise (95) · 184 communes</strong>
              <small>Cabinet du préfet — usage interne</small>
            </span>
          </div>
          <div className="elec-export-bottom"><button type="button" onClick={exportLayerGeoJSON}>Exporter la couche affichée (GeoJSON)</button></div>
        </aside>

        <section className="elec-map-shell">
          <div ref={mapNode} className="elec-map" aria-label="Carte électorale du Val-d'Oise" />
          {!hasChosenScrutin && (
            <div className="elec-map-onboarding">
              <strong>Comment lire la carte</strong>
              <span><b>1</b>Choisissez une élection et un tour dans le menu à gauche.</span>
              <span><b>2</b>La carte se colore alors par tendance politique.</span>
              <span><b>3</b>Cliquez sur une commune pour ouvrir sa synthèse complète.</span>
            </div>
          )}
          {hoveredUnit && <div className="elec-hover-card compact" aria-live="polite"><strong>{hoveredUnit.name}</strong>{hoveredUnit.result ? <>{metric !== "none" && <span>{metricInfo(hoveredUnit.result).label}</span>}<small>Participation {hoveredUnit.result.pct_participation.toFixed(1)} % · cliquez pour la synthèse complète</small></> : <span>Résultat indisponible</span>}</div>}
          {scale === "canton" && election.status === "publie" && !cantonData[`${dataKey}-canton`] && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 400,
                display: "grid",
                placeItems: "center",
                background: "#eef1f7cc",
                pointerEvents: "none",
              }}
            >
              <div style={{ maxWidth: 360, padding: 18, background: "#070047f0", color: "#fff", borderRadius: 14, fontSize: 12, textAlign: "center" }}>
                Résultats par canton non disponibles pour ce scrutin.
              </div>
            </div>
          )}
          {scale === "bv" && election.status === "publie" && !bvData[`${dataKey}-bv`] && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 400,
                display: "grid",
                placeItems: "center",
                background: "#eef1f7cc",
                pointerEvents: "none",
              }}
            >
              <div style={{ maxWidth: 360, padding: 18, background: "#070047f0", color: "#fff", borderRadius: 14, fontSize: 12, textAlign: "center" }}>
                Résultats par bureau de vote non disponibles pour ce scrutin.
              </div>
            </div>
          )}
          {metric === "tete" && <div className="map-trend-legend"><strong>Tendance du scrutin</strong>{[["Gauche","#e4287c"],["Centre","#e8b62f"],["Droite","#2878c8"],["Extrême droite","#14213d"],["Autres","#8b95a3"]].map(([label,color])=><span key={label}><i style={{background:color}}/>{label}</span>)}</div>}
        </section>

        <aside className={`elec-drawer ${drawerOpen ? "open" : ""}`} aria-label="Fiche du scrutin">
          <div className="elec-drawer-head">
            <small>
              {`${SCALES.find((s) => s.id === scale)?.label?.toUpperCase()} · ${election.shortLabel.toUpperCase()} · ${tour.label}`}
            </small>
            <h2>{selectedUnit?.nom || "—"}</h2>
            <p>
              {selectedUnit?.code_insee ? `Code INSEE ${selectedUnit.code_insee}` : selectedUnit?.code_circonscription ? `Code ${selectedUnit.code_circonscription}` : ""}
            </p>
            <button className="elec-close" onClick={resetSelection} aria-label="Fermer" title="Fermer">
              ×
            </button>
          </div>
          {selectedUnit && (
            <>
              <div className="elec-body">
                {scale === "commune" && selectedSocio && (
                  <Section title="Profil sociodémographique" state="INSEE RP 2022">
                    <div className="socio-profile">
                      <div className="socio-pop"><span>Population</span><strong>{Math.round(selectedSocio.population).toLocaleString("fr-FR")}</strong><small>habitants estimés</small></div>
                      <div className="socio-bars">
                        {[{label:"15 à 24 ans",value:selectedSocio.jeunes,color:"#00a7b5"},{label:"65 ans ou plus",value:selectedSocio.seniors,color:"#a558a0"},{label:"Diplôme supérieur",value:selectedSocio.diplomesSup,color:"#18753c"}].map(item => <div key={item.label}><span><b>{item.label}</b><strong>{item.value.toFixed(1)} %</strong></span><i><em style={{width:`${Math.min(100,item.value)}%`,background:item.color}}/></i></div>)}
                      </div>
                    </div>
                    {selectedCode && populationData[selectedCode]?.length ? <PopulationSparkline data={populationData[selectedCode]} /> : null}
                    <p className="elec-context-note"><strong>Source :</strong> INSEE, recensement de la population 2022.</p>
                  </Section>
                )}
                <Section title="Participation" state={`Moyenne sur ${scaleSnapshots.length} tours`}>
                  <div className="participation-gauge"><span style={{width:`${averageCommuneParticipation}%`}}/><b>{averageCommuneParticipation.toFixed(1)} %</b></div>
                  <div className="participation-analysis">
                    <div><span>Participation moyenne</span><strong>{averageCommuneParticipation.toFixed(1)} %</strong><small>sur {scaleSnapshots.length} tours disponibles</small></div>
                    <div><span>Abstention moyenne</span><strong>{(100-averageCommuneParticipation).toFixed(1)} %</strong><small>sur la même période</small></div>
                    {latestScaleSnapshot && (
                      <>
                        <div><span>Participation au dernier scrutin</span><strong>{latestScaleSnapshot.result.pct_participation.toFixed(1)} %</strong><small className={latestScaleSnapshot.result.pct_participation>=averageCommuneParticipation?"up":"down"}>{latestScaleSnapshot.result.pct_participation>=averageCommuneParticipation?"+":""}{(latestScaleSnapshot.result.pct_participation-averageCommuneParticipation).toFixed(1)} pts par rapport à la moyenne · {latestScaleSnapshot.election} · {latestScaleSnapshot.tour}</small></div>
                        <div><span>Abstention au dernier scrutin</span><strong>{latestScaleSnapshot.result.pct_abstention.toFixed(1)} %</strong><small>{latestScaleSnapshot.result.abstentions.toLocaleString("fr-FR")} abstentionnistes</small></div>
                      </>
                    )}
                  </div>
                </Section>
                {scale !== "bv" ? (
                  <>
                    <CommuneSynthesis snapshots={scaleSnapshots} currentKey={dataKey} mode="results" />
                    <CommuneSynthesis snapshots={scaleSnapshots} currentKey={dataKey} mode="families" />
                    <CommuneSynthesis snapshots={scaleSnapshots} currentKey={dataKey} mode="sensitivities" />
                  </>
                ) : (
                  <Section title="Résultats par candidat" state={selectedUnit.candidats.length ? `${selectedUnit.candidats.length} candidats` : "Indisponible"}>
                    {selectedUnit.candidats.length ? <CandidateTable candidats={selectedUnit.candidats} /> : <p className="elec-empty">Le détail par liste ou candidat n’est pas disponible pour ce scrutin.</p>}
                  </Section>
                )}
                <div className="elec-actions elec-actions-bottom">
                  <button onClick={printUnit}>Imprimer la fiche</button>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
      <footer className="elec-footer">
        <span>Atlas électoral du Val-d'Oise — DDT 95</span>
        <span>Municipales, présidentielles, législatives, européennes et départementales</span>
      </footer>

      <dialog ref={departmentDialog} className="elec-dept-dialog">
        <header><div><small>ANALYSE DÉPARTEMENTALE</small><h2>Val-d’Oise</h2><p>Résultats agrégés des 184 communes</p></div><div className="dept-dialog-actions"><button className="dept-pdf" onClick={printDepartment}>Ouvrir la fiche PDF</button><button className="dept-dialog-close" onClick={() => departmentDialog.current?.close()} aria-label="Fermer">×</button></div></header>
        <div className="dept-dialog-body"><DepartmentAnalysis snapshots={departmentSnapshots} currentKey={dataKey} socio={departmentSocio} communeData={allElectionData["europeennes-2024"]?.communes ?? {}} datasets={allElectionData} socioByCommune={socioData} deputies={deputies} councillors={cantonData["departementales-2021-t2-canton"]?.cantons ?? null} /></div>
      </dialog>

      <dialog ref={sourceDialog} className="elec-source-dialog">
        <header>
          <h2>Sources, millésimes et licences</h2>
          <button onClick={() => sourceDialog.current?.close()} aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="dialog-body">
          <table>
            <thead>
              <tr>
                <th>Donnée</th>
                <th>Producteur</th>
                <th>Fréquence</th>
                <th>Lien</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{s.producer}</td>
                  <td>{s.frequency}</td>
                  <td>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      Ouvrir ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </dialog>
    </main>
  );
}

function Legend({ metric, scoreCandidat, current, bounds }: { metric: MetricId; scoreCandidat: string; current?: ElectionCommuneFile; bounds: [number, number] }) {
  if (metric === "tete") {
    // Une entrée par tête de liste/candidat en tête d'au moins une unité, mais regroupée
    // visuellement par couleur (donc par nuance quand elle est connue) pour rester lisible
    // même sur un scrutin à très nombreuses listes (municipales).
    const leaders = new Map<string, { color: string; nuance?: string | null }>();
    if (current) {
      Object.values(current.communes).forEach((c) => {
        if (c.tete?.nom) leaders.set(c.tete.nom, { color: colorForCandidate(c.tete.nom, c.tete.nuance), nuance: c.tete.nuance });
      });
    }
    return (
      <div className="elec-legend">
        <p className="elec-legend-title">Légende — tête de liste</p>
        <div className="elec-legend-swatches">
          {Array.from(leaders.entries()).map(([nom, { color, nuance }]) => (
            <div key={nom} className="elec-legend-swatch">
              <i style={{ background: color }} />
              <span>{nom}</span>
              {nuance && <em className="elec-nuance-tag">{nuance}</em>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="elec-legend">
      <p className="elec-legend-title">Légende — {metric === "score_candidat" ? scoreCandidat.split("|")[0] : metric}</p>
      <div className="elec-legend-scale">
        {SEQUENTIAL_STEPS.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
      <div className="elec-legend-labels">
        <span>{bounds[0]} %</span>
        <span>{bounds[1]} %</span>
      </div>
    </div>
  );
}

function Section({ title, state, children }: { title: string; state: string; children: React.ReactNode }) {
  return (
    <section className="elec-section">
      <div className="elec-section-title">
        <h3>{title}</h3>
        <span className="elec-state">{state}</span>
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PopulationSparkline({ data }: { data: { annee: number; population: number }[] }) {
  if (!data.length) return null;
  const w = 260;
  const h = 56;
  const pad = 4;
  // Marge verticale interne supplémentaire (en plus de `pad`) : sans elle, l'année dont la
  // population est la plus basse retombe exactement sur le bord inférieur du graphique, ce qui
  // se lit visuellement comme "population = 0" cette année-là — alors que l'échelle est
  // volontairement resserrée (voir la note sous le graphique) et ne part jamais de zéro.
  const vpad = 8;
  const min = Math.min(...data.map((d) => d.population));
  const max = Math.max(...data.map((d) => d.population));
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1 || 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - vpad - ((v - min) / range) * (h - pad * 2 - vpad * 2);
  const points = data.map((d, i) => `${x(i)},${y(d.population)}`).join(" ");
  const first = data[0];
  const last = data[data.length - 1];
  const delta = last.population - first.population;
  const pct = first.population ? (delta / first.population) * 100 : 0;
  const middle = data[Math.floor((data.length - 1) / 2)];
  return (
    <div className="elec-population">
      <div className="elec-population-title"><strong>Population de la commune</strong><span>{first.annee}–{last.annee}</span></div>
      <div className="elec-population-chart">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Population de ${first.annee} à ${last.annee}`}>
          <polyline points={points} fill="none" stroke="var(--blue, #000091)" strokeWidth={2.5} />
          {data.map((d, i) => <circle key={d.annee} cx={x(i)} cy={y(d.population)} r={i === 0 || i === data.length - 1 ? 3 : 1.5} fill="var(--blue, #000091)" />)}
        </svg>
        <div className="elec-population-axis"><span>{first.annee}</span><span>{middle.annee}</span><span>{last.annee}</span></div>
      </div>
      <p className="population-scale-note">Échelle resserrée entre {min.toLocaleString("fr-FR")} et {max.toLocaleString("fr-FR")} habitants : la courbe ne part pas de zéro.</p>
      <div className="elec-population-values">
        <span><small>Population {first.annee}</small><strong>{first.population.toLocaleString("fr-FR")}</strong><em>habitants</em></span>
        <span><small>Population {last.annee}</small><strong>{last.population.toLocaleString("fr-FR")}</strong><em>habitants</em></span>
      </div>
      <p className={`elec-population-change ${delta >= 0 ? "up" : "down"}`}><strong>{Math.abs(delta).toLocaleString("fr-FR")} habitant{Math.abs(delta)!==1?"s":""} {delta >= 0 ? "gagnés" : "perdus"}</strong> depuis {first.annee} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)} %).</p>
    </div>
  );
}

type PoliticalGroup = { sensitivity: string; family: string };
function partyLabel(candidate:{nom:string|null;prenom:string|null;nuance:string|null}){
  const name=`${candidate.prenom??""} ${candidate.nom??""}`.toUpperCase();
  if(name.includes("FRANCE REVIENT")||name.includes("BARDELLA")||name.includes("LE PEN"))return "Rassemblement national";
  if(name.includes("LFI")||name.includes("MÉLENCHON")||name.includes("MELENCHON"))return "La France insoumise";
  if(name.includes("BESOIN D'EUROPE")||name.includes("MACRON"))return "Renaissance · MoDem · Horizons";
  if(name.includes("REVEIL EUR")||name.includes("RÉVEIL EUR"))return "Parti socialiste · Place publique";
  if(name.includes("ZEMMOUR")||name.includes("RECONQU"))return "Reconquête";
  const info=nuanceInfo(candidate.nuance); if(info.label!=="Nuance non répertoriée")return info.label;
  const group=politicalGroup(candidate.nuance,name).sensitivity;
  return ({extreme_left:"Extrême gauche",left:"Gauche",center:"Centre",right:"Droite",far_right:"Extrême droite",other:"Sensibilité non renseignée"} as Record<string,string>)[group];
}
function politicalGroup(nuance: string | null, fullName: string): PoliticalGroup {
  const code = nuance?.toUpperCase().trim() ?? "";
  const name = fullName.toUpperCase();
  if (["EXG", "LEXG", "BC-EXG"].includes(code) || name.includes("ARTHAUD") || name.includes("POUTOU")) return { sensitivity: "extreme_left", family: "extreme_left" };
  if (["FI", "LFI"].includes(code) || name.includes("MÉLENCHON") || name.includes("MELENCHON") || name.includes("LFI")) return { sensitivity: "left", family: "lfi" };
  if (["COM", "LCOM", "BC-COM"].includes(code) || name.includes("ROUSSEL")) return { sensitivity: "left", family: "pcf" };
  if (["ECO", "LECO", "VEC", "LVEC", "BC-ECO"].includes(code) || name.includes("JADOT")) return { sensitivity: "left", family: "ecologist" };
  if (["UG", "LUG", "UGE", "BC-UG", "BC-UGE", "SOC", "LSOC", "BC-SOC", "RDG", "BC-RDG", "DVG", "LDVG", "BC-DVG"].includes(code) || name.includes("HIDALGO")) return { sensitivity: "left", family: "social_left" };
  if (["ENS", "LENS", "REM", "LREM", "BC-REM"].includes(code) || name.includes("MACRON")) return { sensitivity: "center", family: "presidential" };
  if (["UDI", "LUD", "MDM", "LMDM", "LUC", "UC", "BC-UDI", "BC-UC", "BC-UCD", "BC-UD"].includes(code)) return { sensitivity: "center", family: "center" };
  if (["LR", "LLR", "DR", "BC-LR"].includes(code) || name.includes("FILLON") || name.includes("PÉCRESSE") || name.includes("PECRESSE")) return { sensitivity: "right", family: "lr" };
  if (["DVD", "LDVD", "DVC", "LDVC", "BC-DVD", "BC-DVC"].includes(code)) return { sensitivity: "right", family: "other_right" };
  if (["RN", "LRN", "BC-RN"].includes(code) || name.includes("LE PEN") || name.includes("BARDELLA")) return { sensitivity: "far_right", family: "rn" };
  if (["REC", "LREC", "EXD", "LEXD", "UXD"].includes(code) || name.includes("ZEMMOUR")) return { sensitivity: "far_right", family: "reconquest" };
  return { sensitivity: "other", family: "other" };
}

function politicalScores(result: UnitResult, dimension: "sensitivity" | "family") {
  const scores: Record<string, number> = {};
  result.candidats.forEach((candidate) => {
    const group = politicalGroup(candidate.nuance, `${candidate.prenom ?? ""} ${candidate.nom ?? ""}`);
    const key = group[dimension];
    scores[key] = (scores[key] ?? 0) + candidate.pct_exprimes;
  });
  return scores;
}

function electionAccent(key: string) {
  if (key.startsWith("pres-2017")) return "#6a5acd";
  if (key.startsWith("municipales-2020")) return "#00a7b5";
  if (key.startsWith("departementales-2021")) return "#a558a0";
  if (key.startsWith("pres-2022")) return "#000091";
  if (key.startsWith("europeennes-2024")) return "#18753c";
  if (key.startsWith("legislatives-2024")) return "#e4794a";
  return "#ce614a";
}

function buildDepartmentScenarios(communeData: Record<string, UnitResult>, datasets: Record<string,ElectionCommuneFile>, socioByCommune: Record<string, SocioProfile>) {
  const sensitivities=[{id:"extreme_left",label:"Extrême gauche",color:"#7a0c0c"},{id:"left",label:"Gauche",color:"#e4287c"},{id:"center",label:"Centre",color:"#e8b62f"},{id:"right",label:"Droite",color:"#2878c8"},{id:"far_right",label:"Extrême droite",color:"#14213d"}];
  const euro=datasets["europeennes-2024"]?aggregateDepartment(datasets["europeennes-2024"]):null;if(!euro)return [];
  const baseline=politicalScores(euro,"sensitivity"),baselineFamily=politicalScores(euro,"family"),avg=euro.pct_participation;
  const simulate=(factorFor:(code:string,u:UnitResult)=>number)=>{const votes:Record<string,number>={},famVotes:Record<string,number>={};let total=0;Object.entries(communeData).forEach(([code,u])=>{const factor=factorFor(code,u);total+=u.exprimes*factor;u.candidats.forEach(c=>{const group=politicalGroup(c.nuance,`${c.prenom??""} ${c.nom??""}`);votes[group.sensitivity]=(votes[group.sensitivity]??0)+c.voix*factor;famVotes[group.family]=(famVotes[group.family]??0)+c.voix*factor})});const pct=(v:number)=>total?v*100/total:0;return{sensitivity:Object.fromEntries(sensitivities.map(x=>[x.id,pct(votes[x.id]??0)])),family:Object.fromEntries(Object.entries(famVotes).map(([k,v])=>[k,pct(v)]))}};
  const refs=["pres-2017-t1","pres-2022-t1","europeennes-2024"];
  const lowRefs=["pres-2017-t1","pres-2022-t1","europeennes-2024","municipales-2020-t1"];
  const percentile75=(values:number[])=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length*.75)]??100};
  const youthThreshold=percentile75(Object.values(socioByCommune).map(x=>x.jeunes));
  const seniorsThreshold=percentile75(Object.values(socioByCommune).map(x=>x.seniors));
  const raw=[
    {label:"Participation habituelle",explanation:"Chaque commune retrouve sa participation moyenne observée aux présidentielles 2017 et 2022 et aux européennes 2024.",data:simulate((code,u)=>{const values=refs.map(k=>datasets[k]?.communes[code]?.pct_participation).filter((v):v is number=>Number.isFinite(v)),target=values.length?values.reduce((a,b)=>a+b,0)/values.length:avg;return u.pct_participation?target/u.pct_participation:1})},
    {label:"Participation haute",explanation:"Chaque commune retrouve son niveau de participation de la présidentielle 2017, le plus élevé de la série.",data:simulate((code,u)=>{const target=datasets["pres-2017-t1"]?.communes[code]?.pct_participation??u.pct_participation;return u.pct_participation?target/u.pct_participation:1})},
    {label:"Participation basse (abstention record)",explanation:"Chaque commune retombe à son niveau de participation le plus bas observé dans la série (présidentielles 2017/2022, européennes 2024, municipales 2020 — abstention record de la période Covid).",data:simulate((code,u)=>{const values=lowRefs.map(k=>datasets[k]?.communes[code]?.pct_participation).filter((v):v is number=>Number.isFinite(v)),target=values.length?Math.min(...values):u.pct_participation;return u.pct_participation?target/u.pct_participation:1})},
    {label:"Territoires jeunes davantage mobilisés",explanation:`Le poids des communes comptant au moins ${youthThreshold.toFixed(1)} % de 15–24 ans augmente de 10 %.`,data:simulate(code=>socioByCommune[code]?.jeunes>=youthThreshold?1.1:1)},
    {label:"Seniors davantage mobilisés",explanation:`Le poids des communes comptant au moins ${seniorsThreshold.toFixed(1)} % de 65 ans et plus augmente de 10 % — les seniors votent historiquement bien plus que la moyenne.`,data:simulate(code=>socioByCommune[code]?.seniors>=seniorsThreshold?1.1:1)},
    {label:"Rattrapage de l’abstention",explanation:`Les communes sous la moyenne départementale remontent à ${avg.toFixed(1)} % de participation.`,data:simulate((_code,u)=>u.pct_participation&&u.pct_participation<avg?avg/u.pct_participation:1)}
  ];
  const leftDetailFor=(fam:Record<string,number>)=>[
    {id:"lfi",label:"La France insoumise",value:fam.lfi??0,delta:(fam.lfi??0)-(baselineFamily.lfi??0),color:"#ce0500"},
    {id:"socdem",label:"Social-démocratie (PS, radicaux de gauche, écologistes)",value:(fam.social_left??0)+(fam.ecologist??0),delta:((fam.social_left??0)+(fam.ecologist??0))-((baselineFamily.social_left??0)+(baselineFamily.ecologist??0)),color:"#e4287c"},
    {id:"pcf",label:"Parti communiste",value:fam.pcf??0,delta:(fam.pcf??0)-(baselineFamily.pcf??0),color:"#d2001f"},
  ].sort((a,b)=>b.value-a.value);
  const farRightDetailFor=(fam:Record<string,number>)=>[
    {id:"rn",label:"Rassemblement national",value:fam.rn??0,delta:(fam.rn??0)-(baselineFamily.rn??0),color:"#14213d"},
    {id:"reconquest",label:"Reconquête",value:fam.reconquest??0,delta:(fam.reconquest??0)-(baselineFamily.reconquest??0),color:"#4b2e83"},
  ].sort((a,b)=>b.value-a.value);
  return raw.map(sc=>{
    const effects=sensitivities.map(x=>({...x,value:sc.data.sensitivity[x.id]??0,delta:(sc.data.sensitivity[x.id]??0)-(baseline[x.id]??0),detail:x.id==="left"?leftDetailFor(sc.data.family):x.id==="far_right"?farRightDetailFor(sc.data.family):undefined}));
    const ordered=effects.slice().sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const main=ordered[0];
    const gain=effects.slice().sort((a,b)=>b.delta-a.delta)[0];
    const loss=effects.slice().sort((a,b)=>a.delta-b.delta)[0];
    let conclusion:string;
    if (Math.abs(main.delta) < .05) {
      conclusion = "Le rapport de forces entre sensibilités resterait quasiment inchangé par rapport aux européennes 2024 : ce scénario ne déplace pas assez de voix pour rebattre les grands équilibres.";
    } else if (gain.delta > .05 && loss.delta < -.05 && gain.id !== loss.id) {
      conclusion = `${gain.label} en tirerait le plus grand bénéfice (${gain.delta>=0?"+":""}${gain.delta.toFixed(1)} point), tandis que ${loss.label} reculerait le plus (${loss.delta.toFixed(1)} point). Une simulation à participation modifiée, pas une prévision électorale.`;
    } else {
      conclusion = `${main.label} est la sensibilité la plus affectée par ce scénario (${main.delta>=0?"+":""}${main.delta.toFixed(1)} point), sans bouleverser le reste du rapport de forces. Une simulation à participation modifiée, pas une prévision électorale.`;
    }
    const lfi=effects.find(e=>e.id==="left")?.detail?.find(d=>d.id==="lfi");
    const rn=effects.find(e=>e.id==="far_right")?.detail?.find(d=>d.id==="rn");
    const center=effects.find(e=>e.id==="center");
    const duel=[lfi,rn,center].filter((x):x is NonNullable<typeof x>=>Boolean(x));
    return{label:sc.label,explanation:sc.explanation,effects,conclusion,duel};
  });
}

// Sénateurs du Val-d'Oise élus en septembre 2023 (série renouvelée, mandat jusqu'en 2029) —
// aucune donnée d'élection sénatoriale dans ce projet (scrutin indirect par grands électeurs,
// hors périmètre des sources data.gouv.fr utilisées ailleurs) : liste et groupe politique
// vérifiés individuellement sur les fiches officielles senat.fr de chaque sénateur.
const SENATORS: { nom: string; prenom: string; nuance: string }[] = [
  { nom: "BAZIN", prenom: "Arnaud", nuance: "LR" },
  { nom: "EUSTACHE-BRINIO", prenom: "Jacqueline", nuance: "LR" },
  { nom: "FARGEOT", prenom: "Daniel", nuance: "UC" },
  { nom: "TEMAL", prenom: "Rachid", nuance: "SOC" },
  { nom: "BARROS", prenom: "Pierre", nuance: "COM" },
];

function ElectedList({ items }: { items: { nom: string; prenom?: string | null; nuance: string | null; subtitle?: string }[] }) {
  return (
    <div className="elec-cand-list">
      {items.map((item, i) => {
        const color = colorForCandidate(item.nom, item.nuance);
        const info = nuanceInfo(item.nuance);
        return (
          <div key={i} className="elec-cand-card" style={{ borderLeftColor: color }}>
            <div className="elec-cand-card-head">
              <span className="elec-cand-name">{item.prenom ? `${item.prenom} ${item.nom}` : item.nom}</span>
              <span className="elec-nuance-pill" style={{ background: color }} title={info.label}>{item.nuance || "—"}</span>
            </div>
            {item.subtitle && <div className="elec-cand-card-foot"><span>{item.subtitle}</span></div>}
          </div>
        );
      })}
    </div>
  );
}

function DepartmentAnalysis({ snapshots, currentKey, socio, communeData, datasets, socioByCommune, deputies, councillors }: { snapshots: ElectionSnapshot[]; currentKey:string; socio: SocioProfile | null; communeData: Record<string, UnitResult>; datasets: Record<string,ElectionCommuneFile>; socioByCommune: Record<string, SocioProfile>; deputies: Record<string, UnitResult> | null; councillors: Record<string, UnitResult> | null }) {
  const current=snapshots.at(-1);if(!current)return <p className="elec-empty">Chargement de l’analyse départementale…</p>;
  const avg=snapshots.length?snapshots.reduce((sum,x)=>sum+x.result.pct_participation,0)/snapshots.length:0;
  const scenarios=buildDepartmentScenarios(communeData,datasets,socioByCommune);
  return <>
    {socio&&<Section title="Profil sociodémographique" state="INSEE RP 2022"><div className="socio-profile"><div className="socio-pop"><span>Population</span><strong>{Math.round(socio.population).toLocaleString("fr-FR")}</strong><small>habitants</small></div><div className="socio-bars">{[{label:"15 à 24 ans",value:socio.jeunes,color:"#00a7b5"},{label:"65 ans ou plus",value:socio.seniors,color:"#a558a0"},{label:"Diplôme supérieur",value:socio.diplomesSup,color:"#18753c"}].map(item=><div key={item.label}><span><b>{item.label}</b><strong>{item.value.toFixed(1)} %</strong></span><i><em style={{width:`${item.value}%`,background:item.color}}/></i></div>)}</div></div></Section>}
    <Section title="Participation" state={`Moyenne sur ${snapshots.length} tours`}><div className="participation-gauge"><span style={{width:`${avg}%`}}/><b>{avg.toFixed(1)} %</b></div><div className="participation-analysis"><div><span>Participation moyenne</span><strong>{avg.toFixed(1)} %</strong><small>sur {snapshots.length} tours disponibles</small></div><div><span>Abstention moyenne</span><strong>{(100-avg).toFixed(1)} %</strong><small>sur la même période</small></div><div><span>Participation au dernier scrutin</span><strong>{current.result.pct_participation.toFixed(1)} %</strong><small>{current.election} · {current.tour}</small></div><div><span>Abstention au dernier scrutin</span><strong>{current.result.pct_abstention.toFixed(1)} %</strong></div></div></Section>
    <Section title="Députés élus" state={deputies ? `${Object.keys(deputies).length} circonscriptions` : "Indisponible"}>
      <p className="elec-synthesis-intro">Élu·e·s aux législatives 2024, par circonscription (2nd tour, ou 1er tour pour les 2 circonscriptions décidées dès celui-ci).</p>
      {deputies ? (
        <ElectedList items={Object.values(deputies).filter(c=>c.tete).map(c=>({ nom: c.tete!.nom ?? "—", prenom: c.tete!.prenom, nuance: c.tete!.nuance, subtitle: c.nom }))} />
      ) : <p className="elec-empty">Chargement…</p>}
    </Section>
    <Section title="Sénateurs" state={`${SENATORS.length} sièges`}>
      <p className="elec-synthesis-intro">Élus en septembre 2023 (mandat jusqu'en 2029). Source : fiches officielles senat.fr.</p>
      <ElectedList items={SENATORS} />
    </Section>
    <Section title="Conseil départemental" state={councillors ? `${Object.keys(councillors).length} cantons` : "Indisponible"}>
      <p className="elec-synthesis-intro">Binômes élus au 2nd tour des départementales 2021, par canton (2 conseiller·ère·s par canton).</p>
      {councillors ? (
        <ElectedList items={Object.values(councillors).filter(c=>c.tete).map(c=>({ nom: c.tete!.nom ?? "—", prenom: null, nuance: c.tete!.nuance, subtitle: c.nom }))} />
      ) : <p className="elec-empty">Chargement…</p>}
    </Section>
    {/* Pas de section "résultats" candidat par candidat ici : sommer les résultats municipaux
        de 184 communes ne produit aucun candidat réel à l'échelle du département (les
        municipales se jouent commune par commune). Une analyse départementale montre des
        moyennes/tendances par sensibilité politique (ci-dessous), jamais un faux classement
        de candidats agrégés. */}
    <CommuneSynthesis snapshots={snapshots} currentKey={currentKey} mode="families"/><CommuneSynthesis snapshots={snapshots} currentKey={currentKey} mode="sensitivities"/>
    <Section title="Scénarios de participation" state="Européennes 2024">
      <p className="elec-synthesis-intro">Chaque scénario modifie la mobilisation territoriale puis mesure l’effet sur les grandes sensibilités : les barres montrent, comme pour la sensibilité moyenne du territoire ci-dessus, le score simulé de chaque sensibilité ; l’écart entre parenthèses indique la variation par rapport à la moyenne européennes 2024 (vert = progression, rouge = recul). Sous chaque carte : le détail par parti de la gauche et de l’extrême droite, puis le duel LFI · RN · Centre en donut.</p>
      <ScenarioTrendChart scenarios={scenarios} />
      <div className="scenario-cards">{scenarios.map(sc=>
        <article key={sc.label}>
          <header><strong>{sc.label}</strong><p>{sc.explanation}</p></header>
          <span className="scenario-block-title">Sensibilités simulées</span>
          <div className="average-sensitivity">{sc.effects.slice().sort((a,b)=>b.value-a.value).map(effect=><article key={effect.id}><span><strong>{effect.label}</strong><b>{effect.value.toFixed(1)} % <em className={effect.delta>=0?"up":"down"}>({effect.delta>=0?"+":""}{effect.delta.toFixed(1)} pt)</em></b></span><i><em style={{width:`${Math.min(100,effect.value/60*100)}%`,background:effect.color}}/></i></article>)}</div>
          <div className="average-scale"><span>0 %</span><span>30 %</span><span>60 %</span></div>
          {sc.effects.filter(effect=>effect.detail?.length).map(effect=>
            <div key={effect.id} className="scenario-detail">
              <span className="scenario-detail-title"><i style={{background:effect.color}}/>Détail « {effect.label} »</span>
              <div className="average-sensitivity compact">{effect.detail!.map(d=><article key={d.id}><span><strong>{d.label}</strong><b>{d.value.toFixed(1)} % <em className={d.delta>=0?"up":"down"}>({d.delta>=0?"+":""}{d.delta.toFixed(1)} pt)</em></b></span><i><em style={{width:`${Math.min(100,d.value/60*100)}%`,background:d.color}}/></i></article>)}</div>
            </div>
          )}
          {sc.duel?.length===3 && <ScenarioDuel duel={sc.duel}/>}
          <footer>{sc.conclusion}</footer>
        </article>
      )}</div>
    </Section>
  </>;
}

const SHORT_POLE_LABEL: Record<string,string> = { lfi: "LFI", rn: "RN", center: "Centre" };
function ScenarioDuel({ duel }: { duel: { id: string; label: string; value: number; delta: number; color: string }[] }) {
  const total = duel.reduce((sum,d)=>sum+d.value,0) || 1;
  const r = 40, C = 2*Math.PI*r;
  let offset = 0;
  const leader = duel.slice().sort((a,b)=>b.value-a.value)[0];
  return (
    <div className="scenario-duel">
      <span className="scenario-duel-title">★ Duel LFI · RN · Centre</span>
      <div className="scenario-duel-body">
        <svg viewBox="0 0 100 100" className="scenario-duel-donut" role="img" aria-label={`${leader.label} en tête avec ${leader.value.toFixed(1)} %`}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="#e3e8ee" strokeWidth="15"/>
          {duel.map(d=>{const len=C*d.value/total,seg=<circle key={d.id} cx="50" cy="50" r={r} fill="none" stroke={d.color} strokeWidth="15" strokeDasharray={`${len} ${C-len}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)"/>;offset+=len;return seg})}
          <text x="50" y="47" textAnchor="middle" className="scenario-duel-value">{leader.value.toFixed(1)} %</text>
          <text x="50" y="61" textAnchor="middle" className="scenario-duel-leader">{SHORT_POLE_LABEL[leader.id] ?? leader.label}</text>
        </svg>
        <ul className="scenario-duel-legend">{duel.map(d=><li key={d.id}><i style={{background:d.color}}/><span>{d.label}</span><b>{d.value.toFixed(1)} %</b><em className={d.delta>=0?"up":"down"}>({d.delta>=0?"+":""}{d.delta.toFixed(1)} pt)</em></li>)}</ul>
      </div>
      <p className="scenario-duel-note">Part relative entre ces trois pôles seulement (hors autres familles) — écarts calculés par rapport à la moyenne européennes 2024.</p>
    </div>
  );
}

function ScenarioTrendChart({ scenarios }: { scenarios: { label: string; duel?: { id: string; label: string; value: number; color: string }[] }[] }) {
  const withDuel = scenarios.filter((sc): sc is typeof sc & { duel: NonNullable<typeof sc["duel"]> } => (sc.duel?.length ?? 0) === 3);
  if (withDuel.length < 2) return null;
  const width = 600, height = 190, padL = 8, padR = 92, padT = 14, padB = 24;
  const maxVal = Math.max(...withDuel.flatMap(sc=>sc.duel.map(d=>d.value)), 10);
  const x = (i:number) => padL + (i*(width-padL-padR))/Math.max(1,withDuel.length-1);
  const y = (v:number) => height-padB-(v/maxVal)*(height-padT-padB);
  const poles = ["lfi","rn","center"].map(id=>{
    const first = withDuel[0].duel.find(d=>d.id===id);
    const last = withDuel[withDuel.length-1].duel.find(d=>d.id===id);
    return first && last ? { id, color: first.color, value: last.value, y: y(last.value) } : null;
  }).filter((p): p is NonNullable<typeof p> => p !== null).sort((a,b)=>a.y-b.y);
  poles.forEach((p,i)=>{ if (i>0 && p.y - poles[i-1].y < 12) p.y = poles[i-1].y + 12; });
  const leaderId = poles.slice().sort((a,b)=>b.value-a.value)[0]?.id;
  return (
    <div className="scenario-trend">
      <span className="scenario-trend-title">Le duel, scénario par scénario</span>
      <svg viewBox={`0 0 ${width} ${height}`} className="scenario-trend-chart" role="img" aria-label="Évolution de LFI, RN et Centre selon les scénarios simulés">
        <line x1={padL} y1={height-padB} x2={width-padR} y2={height-padB} className="scenario-trend-axis"/>
        {["lfi","rn","center"].map(id=>{
          const first = withDuel[0].duel.find(d=>d.id===id); if(!first) return null;
          const points = withDuel.map((sc,i)=>`${x(i)},${y(sc.duel.find(d=>d.id===id)?.value ?? 0)}`).join(" ");
          const pole = poles.find(p=>p.id===id);
          const isLeader = id===leaderId;
          return (
            <g key={id}>
              <polyline points={points} fill="none" stroke={first.color} strokeWidth={isLeader?"4.5":"2"} strokeLinejoin="round" strokeLinecap="round" opacity={isLeader?1:0.75}/>
              {withDuel.map((sc,i)=><circle key={i} cx={x(i)} cy={y(sc.duel.find(d=>d.id===id)?.value ?? 0)} r={isLeader?"6.5":"3.5"} fill={first.color} stroke={isLeader?"#fff":"none"} strokeWidth={isLeader?"1.5":"0"}/>)}
              {pole && <text x={x(withDuel.length-1)+8} y={pole.y+3} className={`scenario-trend-label${isLeader?" is-leader":""}`} fill={first.color}>{isLeader?"★ ":""}{SHORT_POLE_LABEL[id]} {pole.value.toFixed(0)} %</text>}
            </g>
          );
        })}
        {withDuel.map((_sc,i)=><text key={i} x={x(i)} y={height-6} textAnchor="middle" className="scenario-trend-tick">{i+1}</text>)}
      </svg>
      <p className="scenario-trend-note">{withDuel.map((sc,i)=>`${i+1}. ${sc.label}`).join(" · ")}</p>
    </div>
  );
}

function CommuneSynthesis({ snapshots, currentKey, mode }: { snapshots: ElectionSnapshot[]; currentKey: string; mode: "results" | "families" | "sensitivities" }) {
  const sensitivities = [
    { id: "extreme_left", label: "Extrême gauche", color: "#7a0c0c" },
    { id: "left", label: "Gauche", color: "#e4287c" },
    { id: "center", label: "Centre", color: "#e8b62f" },
    { id: "right", label: "Droite", color: "#2878c8" },
    { id: "far_right", label: "Extrême droite", color: "#14213d" },
  ];
  const nationalSeries = ["pres-2017-t1", "pres-2022-t1", "europeennes-2024", "legislatives-2024-t1"]
    .map(key => snapshots.find(snapshot => snapshot.key === key)).filter((snapshot): snapshot is ElectionSnapshot => Boolean(snapshot));
  const shortLabels: Record<string,string> = {"pres-2017-t1":"Prés. 2017","pres-2022-t1":"Prés. 2022","europeennes-2024":"Euro. 2024","legislatives-2024-t1":"Lég. 2024"};
  const seriesScores = nationalSeries.map(snapshot => ({snapshot, scores:politicalScores(snapshot.result,"sensitivity")}));
  if (mode === "sensitivities" && seriesScores.length) {
    const averages = sensitivities.map(item => ({...item,value:seriesScores.reduce((sum,point)=>sum+(point.scores[item.id]??0),0)/seriesScores.length})).sort((a,b)=>b.value-a.value);
    const familySeries = nationalSeries.map(snapshot => ({snapshot, scores:politicalScores(snapshot.result,"family")}));
    const avgFamily = (ids:string[]) => familySeries.length?familySeries.reduce((sum,point)=>sum+ids.reduce((s,id)=>s+(point.scores[id]??0),0),0)/familySeries.length:0;
    const leftDetail = [
      { id: "lfi", label: "La France insoumise", value: avgFamily(["lfi"]), color: "#ce0500" },
      { id: "socdem", label: "Social-démocratie (PS, radicaux de gauche, écologistes)", value: avgFamily(["social_left","ecologist"]), color: "#e4287c" },
      { id: "pcf", label: "Parti communiste", value: avgFamily(["pcf"]), color: "#d2001f" },
    ].sort((a,b)=>b.value-a.value);
    const farRightDetail = [
      { id: "rn", label: "Rassemblement national", value: avgFamily(["rn"]), color: "#14213d" },
      { id: "reconquest", label: "Reconquête", value: avgFamily(["reconquest"]), color: "#4b2e83" },
    ].sort((a,b)=>b.value-a.value);
    return <>
      <Section title="Sensibilité moyenne du territoire" state={`${seriesScores.length} scrutins nationaux`}>
        <div className="average-sensitivity">{averages.map(item=><article key={item.id}><span><strong>{item.label}</strong><b>{item.value.toFixed(1)} %</b></span><i><em style={{width:`${Math.min(100,item.value/60*100)}%`,background:item.color}}/></i></article>)}</div>
        <div className="average-scale"><span>0 %</span><span>30 %</span><span>60 %</span></div>
        <p className="elec-synthesis-intro">Moyenne des présidentielles 2017 et 2022, des européennes 2024 et des législatives 2024. Repère synthétique, pas une prévision.</p>
      </Section>
      <Section title="Détail de la gauche" state={`${familySeries.length} scrutins nationaux`}>
        <p className="elec-synthesis-intro">La « Gauche » regroupée ci-dessus recouvre trois familles distinctes : La France insoumise, la social-démocratie (parti socialiste, radicaux de gauche et écologistes) et le parti communiste. Même moyenne des scrutins que ci-dessus.</p>
        <div className="average-sensitivity">{leftDetail.map(item=><article key={item.id}><span><strong>{item.label}</strong><b>{item.value.toFixed(1)} %</b></span><i><em style={{width:`${Math.min(100,item.value/60*100)}%`,background:item.color}}/></i></article>)}</div>
        <div className="average-scale"><span>0 %</span><span>30 %</span><span>60 %</span></div>
      </Section>
      <Section title="Détail de l’extrême droite" state={`${familySeries.length} scrutins nationaux`}>
        <p className="elec-synthesis-intro">L’« Extrême droite » regroupée ci-dessus recouvre le Rassemblement national et Reconquête. Même moyenne des scrutins que ci-dessus.</p>
        <div className="average-sensitivity">{farRightDetail.map(item=><article key={item.id}><span><strong>{item.label}</strong><b>{item.value.toFixed(1)} %</b></span><i><em style={{width:`${Math.min(100,item.value/60*100)}%`,background:item.color}}/></i></article>)}</div>
        <div className="average-scale"><span>0 %</span><span>30 %</span><span>60 %</span></div>
      </Section>
    </>;
  }
  if (mode === "families") {
    return <Section title="Évolution politique" state="4 scrutins nationaux">
      <p className="elec-synthesis-intro">Évolution des grandes sensibilités sur les derniers scrutins nationaux. Aux législatives 2024, le NFP est compté dans la gauche.</p>
      <div className="political-evolution"><header><span></span>{nationalSeries.map(snapshot=><b key={snapshot.key}>{shortLabels[snapshot.key]}</b>)}</header>{sensitivities.map(item=>{const values=seriesScores.map(point=>point.scores[item.id]??0);const delta=(values.at(-1)??0)-(values[0]??0);return <article key={item.id} style={{"--trend-color":item.color} as CSSProperties}><strong>{item.label}</strong>{values.map((value,index)=><span key={nationalSeries[index].key}><i style={{height:`${Math.max(3,Math.min(48,value/60*48))}px`}}/><b>{value.toFixed(0)} %</b></span>)}<em className={delta>=0?"up":"down"}>{delta>=0?"+":""}{delta.toFixed(1)} pt</em></article>})}</div>
    </Section>;
  }
  // Le menu Élection/Tour ne pilote que la couleur de la carte principale (voir metric/scale
  // plus haut) : cette section reste indépendante de ce choix et montre TOUS les scrutins
  // disponibles à cette échelle, du plus récent au plus ancien (snapshots est trié par date
  // croissante, donc inversé ici), pour permettre une vraie comparaison dans le temps plutôt
  // qu'un résultat isolé.
  const grouped = snapshots.slice().reverse().reduce<Record<string, ElectionSnapshot[]>>((acc, snapshot) => { (acc[snapshot.election] ??= []).push(snapshot); return acc; }, {});
  return <Section title="Derniers résultats par scrutin" state={snapshots.length ? `${snapshots.length} tours` : "Indisponible"}>
      <p className="elec-synthesis-intro">Les quatre premiers candidats de chaque scrutin, du plus récent au plus ancien, avec leur parti ou leur sensibilité politique.</p>
      <div className="elec-all-elections">{Object.entries(grouped).map(([label, rounds]) => <article key={label} style={{"--election-color":electionAccent(rounds[0].key)} as CSSProperties}>
        <header><strong>{label}</strong><span>{rounds.length} tour{rounds.length > 1 ? "s" : ""}</span></header>
        {rounds.map(snapshot => <div className="election-round" key={snapshot.key}><div className="round-heading"><strong>{snapshot.tour}</strong><span>Participation <b>{snapshot.result.pct_participation.toFixed(1)} %</b></span></div><div>{snapshot.result.candidats.slice().sort((a,b) => b.pct_exprimes - a.pct_exprimes).slice(0,4).map((candidate, index) => {
          const color = colorForCandidate(candidate.nom, candidate.nuance);
          return <div className="elec-top-result" key={`${candidate.nom}-${candidate.prenom}-${index}`}><span className="rank">{index + 1}</span><div><strong>{candidate.prenom} {candidate.nom ?? ""}<small>{partyLabel(candidate)}</small></strong><i><em style={{ width: `${Math.max(0, Math.min(100, candidate.pct_exprimes))}%`, background: color }} /></i></div><b>{candidate.pct_exprimes.toFixed(1)} %</b></div>;
        })}</div></div>)}
      </article>)}</div>
    </Section>;
}

// Liste de résultats sous forme de cartes colorées par nuance (plutôt qu'un tableau plat) :
// liseré et pastille de couleur à gauche = famille politique (app/lib/nuances.ts), barre
// proportionnelle au score, trophée sur la tête de liste/candidat arrivé en tête. Reste
// sobre (pas de logo de parti, jamais utilisé — voir DATA.md) tout en donnant une lecture
// plus immédiate qu'un tableau pour un scrutin à de nombreuses listes (municipales).
function CandidateTable({ candidats }: { candidats: UnitResult["candidats"] }) {
  return (
    <div className="elec-cand-list">
      {candidats.map((c, i) => {
        const color = colorForCandidate(c.nom, c.nuance);
        const info = nuanceInfo(c.nuance);
        return (
          <div key={i} className={`elec-cand-card ${i === 0 ? "lead" : ""}`} style={{ borderLeftColor: color }}>
            <div className="elec-cand-card-head">
              <span className="elec-cand-name">
                {i === 0 && (
                  <span className="elec-cand-trophy" aria-hidden="true" title="Arrivé·e en tête">
                    ★
                  </span>
                )}
                {c.prenom} {c.nom}
              </span>
              <span className="elec-nuance-pill" style={{ background: color }} title={info.label}>
                {c.nuance || "—"}
              </span>
            </div>
            <div className="elec-cand-bar-track">
              <div className="elec-cand-bar-fill" style={{ width: `${Math.max(0, Math.min(100, c.pct_exprimes))}%`, background: color }} />
            </div>
            <div className="elec-cand-card-foot">
              <span>{partyLabel(c)}</span>
              <span className="num">
                {c.voix.toLocaleString("fr-FR")} voix · {c.pct_exprimes.toFixed(2)} %
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
