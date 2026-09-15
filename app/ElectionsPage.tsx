/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ELECTIONS, findElection } from "./lib/elections";
import { colorForCandidate, sequentialColor, SEQUENTIAL_STEPS } from "./lib/color";
import { nuanceInfo } from "./lib/nuances";
import type { ElectionCircoFile, ElectionCommuneFile, MetricId, Scale, UnitResult } from "./lib/types";
import electionSources from "../config/election-sources.json";

const basePath = (import.meta as any).env?.BASE_URL?.replace(/\/$/, "") || "";

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
  const [metric, setMetric] = useState<DisplayMetric>("none");
  const [scoreCandidat, setScoreCandidat] = useState<string>("");

  const [communesGeo, setCommunesGeo] = useState<any>(null);
  const [circoGeo, setCircoGeo] = useState<any>(null);
  const [bvGeo, setBvGeo] = useState<any>(null);
  const [cantonGeo, setCantonGeo] = useState<any>(null);
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
  const [exportOpen, setExportOpen] = useState(false);
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
      fetchJson<any>("/data/geo/masque-95.geojson").catch(() => null),
      fetchJson<any>("/data/insee/context-95.json").catch(() => null),
      fetchJson<any>("/data/insee/population-historique-95.json").catch(() => null),
    ])
      .then(([communes, circo, bv, canton, mask, insee, population]) => {
        setCommunesGeo(communes);
        setCircoGeo(circo);
        setBvGeo(bv);
        setCantonGeo(canton);
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
  useEffect(() => {
    if (!document.getElementById("elec-leaflet-css")) {
      const css = document.createElement("link");
      css.id = "elec-leaflet-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    const start = () => {
      if (mapRef.current || !mapNode.current) return;
      const L = (window as any).L;
      if (!L) return;
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
    const existing = document.querySelector<HTMLScriptElement>('script[data-elec-leaflet="true"]');
    if ((window as any).L) start();
    else if (existing) existing.addEventListener("load", start, { once: true });
    else {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.dataset.elecLeaflet = "true";
      script.onload = start;
      document.body.appendChild(script);
    }
  }, []);

  // Incrémenté une fois que la carte Leaflet est prête (script chargé + conteneur mesurable).
  // Doit être lu par l'effet de rendu de la couche choroplèthe (sinon celui-ci, qui se déclenche
  // par ailleurs sur l'arrivée asynchrone des géométries/résultats, peut avoir déjà tenté — et
  // abandonné faute de carte prête — tous ses passages avant que Leaflet ne finisse de charger ;
  // sans ce signal en dépendance, aucun de ses effets ultérieurs ne le redéclenche et la carte
  // reste vide indéfiniment, même si toutes les données sont là).
  const [mapReady, setMapReady] = useState(0);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapRef.current;
    if (!L || !map || !maskGeo || !mapReady) return;
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
    return () => mask.remove();
  }, [maskGeo, mapReady]);

  // ---- Détermination des valeurs par unité selon métrique ----
  function metricInfo(u: UnitResult): { value: number | null; color: string; label: string } {
    if (metric === "none") return { value: null, color: "#dbe3e8", label: "Carte non colorée" };
    if (metric === "tete") {
      const t = u.tete;
      if (!t) return { value: null, color: "#c7cfda", label: "—" };
      return {
        value: t.pct_exprimes,
        color: colorForCandidate(t.nom, t.nuance),
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
    const L = (window as any).L;
    const map = mapRef.current;
    // Tant que Leaflet/la carte ne sont pas prêts, on ne peut rien construire ; cet effet sera
    // rejoué automatiquement dès que mapReady passera à une valeur non nulle (cf. dépendances
    // ci-dessous), donc l'abandon ici est temporaire et non définitif.
    if (!L || !map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    layersByCodeRef.current = {};
    styleFnsRef.current = null;

    // Style de base (repos), survol (aperçu léger au passage de la souris) et sélection
    // (halo persistant tant que la fiche est ouverte pour cette unité). Le survol et la
    // sélection restent visuellement distincts : le survol éclaircit juste le contour, la
    // sélection l'épaissit fortement dans le bleu de la marque avec un liseré pointillé.
    function withHover(base: any) {
      return { ...base, color: "#5b6bff", weight: base.weight + 1.2 };
    }
    function withSelected(base: any) {
      return { ...base, color: "#000091", weight: base.weight + 2.2, dashArray: "5,3", opacity: 1 };
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
        return { color: "#fff", weight: 1.6, fillColor: info?.color ?? "#e9edf3", fillOpacity: info ? 0.82 : 0.35 };
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
      return { color: "#fff", weight: baseWeight, fillColor: info.color, fillOpacity: metric === "none" ? 0.72 : 0.82 };
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
  }, [scale, communesGeo, circoGeo, bvGeo, bvData, cantonGeo, cantonData, current, circoData, dataKey, metric, scoreCandidat, mapReady]);

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
    if (scale === "bv") {
      const b = bvData[`${dataKey}-bv`]?.bureaux?.[selectedCode];
      return b ? normalizeBureau(b) : null;
    }
    if (scale === "canton") return cantonData[`${dataKey}-canton`]?.cantons?.[selectedCode] ?? null;
    return current?.communes[selectedCode] ?? null;
  }, [selectedCode, scale, current, circoData, bvData, cantonData, dataKey]);

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
      if (scale !== "canton" && scale !== "circonscription") return [];
      const result = scale === "canton" ? cantonData[`${itemTour.file}-canton`]?.cantons?.[selectedCode] : circoData[`${itemTour.file}-circo`]?.circonscriptions?.[selectedCode];
      if (!result) return [];
      return [{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result}];
    })).sort((a,b)=>a.date.localeCompare(b.date));
  }, [allElectionData, cantonData, circoData, scale, selectedCode]);
  const departmentSnapshots = useMemo<ElectionSnapshot[]>(() => ELECTIONS.flatMap(item => item.tours.flatMap(itemTour => { const file=allElectionData[itemTour.file]; return file?[{key:itemTour.file,election:item.shortLabel,tour:itemTour.label,date:file.date,result:aggregateDepartment(file)}]:[]; })).sort((a,b)=>a.date.localeCompare(b.date)), [allElectionData]);
  const departmentSocio = useMemo<SocioProfile | null>(() => { const values=Object.values(socioData); const population=values.reduce((s,v)=>s+v.population,0); if(!population)return null; return {population,jeunes:values.reduce((s,v)=>s+v.jeunes*v.population,0)/population,seniors:values.reduce((s,v)=>s+v.seniors*v.population,0)/population,diplomesSup:values.reduce((s,v)=>s+v.diplomesSup*v.population,0)/population}; }, [socioData]);
  const averageCommuneParticipation = scaleSnapshots.length ? scaleSnapshots.reduce((sum,snapshot)=>sum+snapshot.result.pct_participation,0)/scaleSnapshots.length : 0;
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

  function exportFeatureGeoJSON() {
    if (!selectedUnit) return;
    const geo = layerGeoOf();
    const feature = geo?.features.find((f: any) => layerGeoAndCodeOf(f) === selectedCode);
    if (!feature) return;
    downloadBlob(`${selectedUnit.nom}-${dataKey}.geojson`, JSON.stringify({ type: "Feature", ...feature, properties: { ...feature.properties, resultats: selectedUnit } }), "application/geo+json");
  }

  // ---- Impression ----
  function printUnit() {
    if (!selectedUnit) return;
    const token = crypto.randomUUID();
    localStorage.setItem(
      `elections-print-${token}`,
      JSON.stringify({
        unit: selectedUnit,
        election: `${election.label} · ${tour.label}`,
        scale: SCALES.find((item) => item.id === scale)?.label ?? scale,
        coverage: 1,
        source: electionSources,
        snapshots: scaleSnapshots,
        currentKey: dataKey,
        socio: selectedSocio,
        populationHistory: selectedCode ? populationData[selectedCode] ?? [] : [],
        date: new Date().toISOString(),
      }),
    );
    window.open(`${basePath}/print.html#${token}`, "_blank", "noopener");
  }

  return (
    <main className="elec-page">
      <header className="elec-header">
        <div className="elec-header-logo">
          <img src={`${basePath}/prefet-val-doise-logo.png`} alt="Préfet du Val-d'Oise" />
        </div>
        <div className="elec-header-copy">
          <span>ATLAS ÉLECTORAL</span>
          <h1>Atlas électoral du Val-d'Oise</h1>
          <p>Résultats, participation et profil sociodémographique — communes, cantons, circonscriptions et département</p>
        </div>
        <div className="elec-header-actions" />
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

          <div className="elec-scale-menu" aria-label="Échelle cartographique">
            {[{id:"commune",label:"Communes",note:"184 territoires"},{id:"canton",label:"Cantons",note:"21 cantons"},{id:"circonscription",label:"Circonscriptions",note:"10 circonscriptions législatives"}].map(item=><label key={item.id} className="elec-scale-switch"><input type="radio" name="scale" checked={scale===item.id} onChange={()=>{setScale(item.id as Scale);resetSelection();}}/><span><strong>{item.label}</strong><small>{item.note}</small></span></label>)}
          </div>

          <div className="elec-sidebar-block-title">Élection et tour</div>
          <select
            className="elec-select"
            value={electionId}
            onChange={(e) => {
              setElectionId(e.target.value);
              const el = findElection(e.target.value);
              setTourId(el.tours[el.tours.length - 1].id);
              setMetric("none");
              resetSelection();
            }}
          >
            {ELECTIONS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.status === "a_completer" ? " (à compléter)" : ""}
              </option>
            ))}
          </select>
          <select
            className="elec-select"
            value={tourId}
            onChange={(e) => {
              setTourId(e.target.value);
              setMetric("none");
              resetSelection();
            }}
          >
            {election.tours.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
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
          <div className="elec-export-bottom"><button type="button" onClick={() => setExportOpen((o) => !o)}>Exporter la couche affichée (GeoJSON)</button>{exportOpen&&<div>{<button onClick={()=>{exportLayerGeoJSON();setExportOpen(false)}}>Toute la couche « {SCALES.find(s=>s.id===scale)?.label} »</button>}{selectedUnit&&<button onClick={()=>{exportFeatureGeoJSON();setExportOpen(false)}}>Uniquement « {selectedUnit.nom} »</button>}</div>}</div>
        </aside>

        <section className="elec-map-shell">
          <div ref={mapNode} className="elec-map" aria-label="Carte électorale du Val-d'Oise" />
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
          {metric === "none" && <div className="elec-map-onboarding"><strong>Explorez le Val-d’Oise par {scale === "commune" ? "commune" : scale === "canton" ? "canton" : "circonscription"}</strong><span><b>1</b> Survolez un territoire pour l’identifier</span><span><b>2</b> Cliquez pour ouvrir sa fiche</span></div>}
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
                <Section title="Participation" state={election.shortLabel}>
                  <div className="participation-gauge"><span style={{width:`${selectedUnit.pct_participation}%`}}/><b>{selectedUnit.pct_participation.toFixed(1)} %</b></div>
                  <div className="participation-analysis">
                    <div><span>Participation du scrutin</span><strong>{selectedUnit.pct_participation.toFixed(1)} %</strong><small className={selectedUnit.pct_participation>=averageCommuneParticipation?"up":"down"}>{selectedUnit.pct_participation>=averageCommuneParticipation?"+":""}{(selectedUnit.pct_participation-averageCommuneParticipation).toFixed(1)} pts par rapport à la moyenne</small></div>
                    <div><span>Participation moyenne</span><strong>{averageCommuneParticipation.toFixed(1)} %</strong><small>sur {scaleSnapshots.length} tours disponibles</small></div>
                    <div><span>Abstention du scrutin</span><strong>{selectedUnit.pct_abstention.toFixed(1)} %</strong><small>{selectedUnit.abstentions.toLocaleString("fr-FR")} abstentionnistes</small></div>
                    <div><span>Abstention moyenne</span><strong>{(100-averageCommuneParticipation).toFixed(1)} %</strong><small>sur la même période</small></div>
                  </div>
                </Section>
                {scale === "commune" ? (
                  <>
                    <CommuneSynthesis snapshots={communeSnapshots} currentKey={dataKey} mode="results" />
                    <CommuneSynthesis snapshots={communeSnapshots} currentKey={dataKey} mode="families" />
                    <CommuneSynthesis snapshots={communeSnapshots} currentKey={dataKey} mode="sensitivities" />
                  </>
                ) : (
                  <Section title="Résultats par candidat" state={selectedUnit.candidats.length ? `${selectedUnit.candidats.length} candidats` : "Indisponible"}>
                    {selectedUnit.candidats.length ? <CandidateTable candidats={selectedUnit.candidats} /> : <p className="elec-empty">Le détail par liste ou candidat n’est pas disponible pour ce scrutin.</p>}
                  </Section>
                )}
                <div className="elec-actions elec-actions-bottom">
                  <button onClick={printUnit}>Imprimer la fiche</button>
                  <a href="#" onClick={(e) => { e.preventDefault(); exportFeatureGeoJSON(); }}>
                    Exporter GeoJSON
                  </a>
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
        <header><div><small>ANALYSE DÉPARTEMENTALE</small><h2>Val-d’Oise</h2><p>Résultats agrégés des 184 communes</p></div><div className="dept-dialog-actions"><button className="dept-pdf" onClick={() => window.print()}>Imprimer / PDF</button><button className="dept-dialog-close" onClick={() => departmentDialog.current?.close()} aria-label="Fermer">×</button></div></header>
        <div className="dept-dialog-body"><DepartmentAnalysis snapshots={departmentSnapshots} socio={departmentSocio} communeData={allElectionData["europeennes-2024"]?.communes ?? {}} datasets={allElectionData} socioByCommune={socioData} /></div>
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
  const min = Math.min(...data.map((d) => d.population));
  const max = Math.max(...data.map((d) => d.population));
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1 || 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
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
          <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="#d8e0e8" strokeWidth="1" />
          <polyline points={points} fill="none" stroke="var(--blue, #000091)" strokeWidth={2.5} />
          {data.map((d, i) => <circle key={d.annee} cx={x(i)} cy={y(d.population)} r={i === 0 || i === data.length - 1 ? 3 : 1.5} fill="var(--blue, #000091)" />)}
        </svg>
        <div className="elec-population-axis"><span>{first.annee}</span><span>{middle.annee}</span><span>{last.annee}</span></div>
      </div>
      <div className="elec-population-values">
        <span><small>Au départ</small><strong>{first.population.toLocaleString("fr-FR")}</strong><em>habitants en {first.annee}</em></span>
        <span><small>Dernière valeur</small><strong>{last.population.toLocaleString("fr-FR")}</strong><em>habitants en {last.annee}</em></span>
      </div>
      <p className={`elec-population-change ${delta >= 0 ? "up" : "down"}`}><strong>{Math.abs(delta).toLocaleString("fr-FR")} habitant{Math.abs(delta)!==1?"s":""} {delta >= 0 ? "gagnés" : "perdus"}</strong> depuis {first.annee} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)} %).</p>
    </div>
  );
}

type PoliticalGroup = { sensitivity: string; family: string };
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

function DepartmentAnalysis({ snapshots, socio, communeData, datasets, socioByCommune }: { snapshots: ElectionSnapshot[]; socio: SocioProfile | null; communeData: Record<string, UnitResult>; datasets: Record<string,ElectionCommuneFile>; socioByCommune: Record<string, SocioProfile> }) {
  const current = snapshots.find(s => s.key === "europeennes-2024") ?? snapshots.at(-1);
  if (!current) return <p className="elec-empty">Chargement de l’analyse départementale…</p>;
  const presidential = snapshots.filter(s => s.key.startsWith("pres-") && s.key.endsWith("-t1"));
  const families = [
    {id:"lfi",label:"LFI",color:"#ce0500"},{id:"social_left",label:"Gauche sociale",color:"#e4287c"},{id:"ecologist",label:"Écologistes",color:"#18753c"},{id:"presidential",label:"Bloc présidentiel",color:"#e8b62f"},{id:"lr",label:"LR",color:"#0066cc"},{id:"rn",label:"RN",color:"#14213d"},{id:"reconquest",label:"Reconquête",color:"#4b2e83"},
  ];
  const sensitivities = [{id:"extreme_left",label:"Extrême gauche",color:"#7a0c0c"},{id:"left",label:"Gauche",color:"#e4287c"},{id:"center",label:"Centre",color:"#e8b62f"},{id:"right",label:"Droite",color:"#2878c8"},{id:"far_right",label:"Extrême droite",color:"#14213d"}];
  const currentSensitivity = politicalScores(current.result,"sensitivity");
  const baseline = Object.fromEntries(sensitivities.map(s => [s.id,currentSensitivity[s.id]??0]));
  const simulate = (factorFor:(code:string,u:UnitResult)=>number) => { const votes:Record<string,number>={}; let total=0; Object.entries(communeData).forEach(([code,u])=>{const factor=factorFor(code,u); total+=u.exprimes*factor; u.candidats.forEach(c=>{const group=politicalGroup(c.nuance,`${c.prenom??""} ${c.nom??""}`).sensitivity;votes[group]=(votes[group]??0)+c.voix*factor;});}); return Object.fromEntries(sensitivities.map(s=>[s.id,total?(votes[s.id]??0)*100/total:0])); };
  const avgParticipation = current.result.pct_participation;
  const referenceKeys=["pres-2017-t1","pres-2022-t1","europeennes-2024"];
  const usualTurnout = simulate((code,u)=>{const values=referenceKeys.map(k=>datasets[k]?.communes[code]?.pct_participation).filter((v):v is number=>Number.isFinite(v));const target=values.length?values.reduce((a,b)=>a+b,0)/values.length:avgParticipation;return u.pct_participation?target/u.pct_participation:1;});
  const highTurnout = simulate((code,u)=>{const target=datasets["pres-2017-t1"]?.communes[code]?.pct_participation??u.pct_participation;return u.pct_participation?target/u.pct_participation:1;});
  const catchup = simulate((_code,u)=>u.pct_participation&&u.pct_participation<avgParticipation?avgParticipation/u.pct_participation:1);
  const youthValues=Object.values(socioByCommune).map(s=>s.jeunes).sort((a,b)=>a-b), youthThreshold=youthValues[Math.floor(youthValues.length*.75)]??100;
  const youthTerritories = simulate((code)=>socioByCommune[code]?.jeunes>=youthThreshold?1.1:1);
  const scenarios=[{label:"Vote observé",data:baseline,note:"Européennes 2024 · participation 48,3 %"},{label:"Participation habituelle",data:usualTurnout,note:"Profil moyen communal des présidentielles 2017/2022 et européennes 2024"},{label:"Participation haute",data:highTurnout,note:"Profil territorial de la présidentielle 2017 · 77,1 %"},{label:"Communes jeunes +10 %",data:youthTerritories,note:`Poids accru des communes comptant au moins ${youthThreshold.toFixed(1)} % de 15–24 ans`},{label:"Rattrapage des communes abstentionnistes",data:catchup,note:"Les communes sous la moyenne atteignent 48,3 % de participation"}];
  const mainSensitivity=sensitivities.slice().sort((a,b)=>(baseline[b.id]??0)-(baseline[a.id]??0))[0];
  const participationSeries=snapshots.filter(s=>s.key.startsWith("pres-")&&s.key.endsWith("-t1")||s.key.startsWith("europeennes-")).map(s=>({label:s.election.replace("Présidentielle ","Prés. ").replace("Européennes ","Euro. "),value:s.result.pct_participation}));
  return <>
    <p className="dept-analysis-base">Base des scénarios : Européennes 2024</p><div className="dept-summary"><div><span>Participation</span><strong>{current.result.pct_participation.toFixed(1)} %</strong></div><div><span>Sensibilité en tête</span><strong style={{color:mainSensitivity.color}}>{mainSensitivity.label}</strong></div><div><span>Exprimés</span><strong>{current.result.exprimes.toLocaleString("fr-FR")}</strong></div></div>
    {socio && <Section title="Bilan sociodémographique" state="INSEE RP 2022"><div className="dept-profile"><strong>{Math.round(socio.population).toLocaleString("fr-FR")} habitants</strong><div>{[["15–24 ans",socio.jeunes,"#00a7b5"],["65 ans ou plus",socio.seniors,"#a558a0"],["Diplôme supérieur",socio.diplomesSup,"#18753c"]].map(([label,value,color])=><span key={String(label)}><b>{label}</b><i><em style={{width:`${value}%`,background:String(color)}}/></i><strong>{Number(value).toFixed(1)} %</strong></span>)}</div></div></Section>}
    <Section title="Bilan électoral" state="Européennes 2024"><div className="dept-top-four">{current.result.candidats.slice(0,4).map((c,i)=><div key={`${c.nom}-${i}`}><span><b>{i+1}</b><strong>{c.prenom} {c.nom}</strong></span><i><em style={{width:`${c.pct_exprimes}%`,background:colorForCandidate(c.nom,c.nuance)}}/></i><b>{c.pct_exprimes.toFixed(1)} %</b></div>)}</div><div className="dept-balance">{sensitivities.map(s=>{const value=baseline[s.id]??0;return value?<i key={s.id} style={{width:`${value}%`,background:s.color}} title={`${s.label} ${value.toFixed(1)} %`}>{value>=11?`${value.toFixed(0)} %`:""}</i>:null})}</div></Section>
    <Section title="Participation" state="Scrutins nationaux"><div className="dept-participation-chart">{participationSeries.map(p=><span key={p.label}><i><em style={{height:`${p.value}%`}}/></i><b>{p.value.toFixed(1)} %</b><small>{p.label}</small></span>)}</div></Section>
    <Section title="Évolution des votes" state="Présidentielles 2017–2022"><p className="elec-synthesis-intro">Premiers tours comparés à scrutin identique.</p><div className="dept-evolution">{families.map(f=>{const start=politicalScores(presidential[0]?.result??current.result,"family")[f.id]??0,end=politicalScores(presidential.at(-1)?.result??current.result,"family")[f.id]??0,delta=end-start;return <div key={f.id} style={{"--trend":f.color} as CSSProperties}><span><strong>{f.label}</strong><b className={delta>=0?"up":"down"}>{delta>=0?"+":""}{delta.toFixed(1)} pts</b></span><i><em style={{width:`${Math.min(100,end)}%`}}/></i><small>2017 {start.toFixed(1)} % → 2022 {end.toFixed(1)} %</small></div>})}</div></Section>
    <Section title="Scénarios de participation" state="Comparaison au vote observé"><p className="elec-synthesis-intro">Chaque scénario change uniquement le poids des communes selon leur niveau de participation. Les choix politiques observés dans chaque commune restent inchangés.</p><div className="scenario-method"><article><strong>Participation habituelle</strong><span>Chaque commune retrouve sa participation moyenne mesurée sur les présidentielles 2017 et 2022 et les européennes 2024.</span></article><article><strong>Participation haute</strong><span>Chaque commune reprend son niveau de mobilisation de la présidentielle 2017, scrutin le plus participatif de la série.</span></article><article><strong>Communes jeunes +10 %</strong><span>Le poids des communes ayant le plus de 15–24 ans augmente de 10 %. Ce test porte sur les territoires jeunes, pas sur le vote individuel des jeunes.</span></article><article><strong>Rattrapage de l’abstention</strong><span>Les communes sous la moyenne départementale sont remontées à 48,3 % de participation.</span></article></div><div className="scenario-impact"><header><strong>Scénario</strong><strong>Progression</strong><strong>Recul</strong><strong>Amplitude</strong></header>{scenarios.slice(1).map(sc=>{const changes=sensitivities.map(s=>({...s,delta:(sc.data[s.id]??0)-(baseline[s.id]??0)}));const up=changes.slice().sort((a,b)=>b.delta-a.delta)[0],down=changes.slice().sort((a,b)=>a.delta-b.delta)[0],effect=Math.max(...changes.map(c=>Math.abs(c.delta)));return <article key={sc.label}><div><strong>{sc.label}</strong><small>{sc.note}</small></div><span style={{color:up.color}}>{up.delta>0.05?`${up.label} +${up.delta.toFixed(1)} pt`:"Pas de hausse nette"}</span><span style={{color:down.color}}>{down.delta<-0.05?`${down.label} ${down.delta.toFixed(1)} pt`:"Pas de recul net"}</span><b className={effect<.2?"neutral":"marked"}>{effect<.2?"Effet faible":`${effect.toFixed(1)} pt`}</b></article>})}</div></Section>
    <Section title="Lecture" state="Constats"><ul className="dept-findings"><li><b>Rapport de forces actuel :</b> {mainSensitivity.label.toLowerCase()} en tête avec {(baseline[mainSensitivity.id]??0).toFixed(1)} % des exprimés classés.</li><li><b>Participation :</b> {current.result.pct_abstention.toFixed(1)} % d’abstention au tour sélectionné.</li><li><b>Effet territorial jeunesse :</b> {sensitivities.map(s=>({label:s.label,delta:(youthTerritories[s.id]??0)-(baseline[s.id]??0)})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0].label} varie le plus dans le scénario, sans permettre d’en déduire le vote des jeunes.</li></ul></Section>
  </>;
}

function CommuneSynthesis({ snapshots, currentKey, mode }: { snapshots: ElectionSnapshot[]; currentKey: string; mode: "results" | "families" | "sensitivities" }) {
  void currentKey;
  const meaningful = snapshots.filter((snapshot) => {
    if (snapshot.key.startsWith("pres-")) return snapshot.key.endsWith("-t1");
    if (!snapshot.key.match(/-t\d$/)) return true;
    const sameElection = snapshots.filter(item => item.election === snapshot.election);
    return snapshot.key === sameElection.at(-1)?.key;
  });
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
    return <Section title="Sensibilité moyenne du territoire" state={`${seriesScores.length} scrutins nationaux`}>
      <div className="average-sensitivity">{averages.map(item=><article key={item.id}><span><strong>{item.label}</strong><b>{item.value.toFixed(1)} %</b></span><i><em style={{width:`${Math.min(100,item.value/60*100)}%`,background:item.color}}/></i></article>)}</div>
      <div className="average-scale"><span>0 %</span><span>30 %</span><span>60 %</span></div>
      <p className="elec-synthesis-intro">Moyenne des présidentielles 2017 et 2022, des européennes 2024 et des législatives 2024. Repère synthétique, pas une prévision.</p>
    </Section>;
  }
  if (mode === "families") {
    return <Section title="Évolution politique" state="4 scrutins nationaux">
      <p className="elec-synthesis-intro">Évolution des grandes sensibilités sur les derniers scrutins nationaux. Aux législatives 2024, le NFP est compté dans la gauche.</p>
      <div className="political-evolution"><header><span></span>{nationalSeries.map(snapshot=><b key={snapshot.key}>{shortLabels[snapshot.key]}</b>)}</header>{sensitivities.map(item=>{const values=seriesScores.map(point=>point.scores[item.id]??0);const delta=(values.at(-1)??0)-(values[0]??0);return <article key={item.id} style={{"--trend-color":item.color} as CSSProperties}><strong>{item.label}</strong>{values.map((value,index)=><span key={nationalSeries[index].key}><i style={{height:`${Math.max(3,Math.min(48,value/60*48))}px`}}/><b>{value.toFixed(0)} %</b></span>)}<em className={delta>=0?"up":"down"}>{delta>=0?"+":""}{delta.toFixed(1)} pt</em></article>})}</div>
    </Section>;
  }
  const shown = snapshots.filter(snapshot => snapshot.key.startsWith("pres-") || meaningful.some(item => item.key === snapshot.key));
  const grouped = shown.slice().reverse().reduce<Record<string, ElectionSnapshot[]>>((acc, snapshot) => { (acc[snapshot.election] ??= []).push(snapshot); return acc; }, {});
  return <Section title="Résultats des élections" state={`${shown.length} tours`}>
      <p className="elec-synthesis-intro">Les quatre premiers. Les deux tours sont conservés uniquement pour les présidentielles.</p>
      <div className="elec-all-elections">{Object.entries(grouped).map(([label, rounds]) => <article key={label} style={{"--election-color":electionAccent(rounds[0].key)} as CSSProperties}>
        <header><strong>{label}</strong><span>{rounds.length} tour{rounds.length > 1 ? "s" : ""}</span></header>
        {rounds.map(snapshot => <div className="election-round" key={snapshot.key}><div className="round-heading"><strong>{snapshot.tour}</strong><span>Participation <b>{snapshot.result.pct_participation.toFixed(1)} %</b></span></div><div>{snapshot.result.candidats.slice().sort((a,b) => b.pct_exprimes - a.pct_exprimes).slice(0,4).map((candidate, index) => {
          const color = colorForCandidate(candidate.nom, candidate.nuance);
          return <div className="elec-top-result" key={`${candidate.nom}-${candidate.prenom}-${index}`}><span className="rank">{index + 1}</span><div><strong>{candidate.prenom} {candidate.nom ?? nuanceInfo(candidate.nuance).label}</strong><i><em style={{ width: `${Math.max(0, Math.min(100, candidate.pct_exprimes))}%`, background: color }} /></i></div><b>{candidate.pct_exprimes.toFixed(1)} %</b></div>;
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
              <span>{info.label}</span>
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
