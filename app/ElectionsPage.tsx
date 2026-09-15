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
  const [metric, setMetric] = useState<MetricId>("tete");
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

  const election = findElection(electionId);
  const tour = election.tours.find((t) => t.id === tourId) ?? election.tours[0];
  const dataKey = tour.file;
  const current = electionData[dataKey];
  const tourStatus: "reel" | "a_completer" = current?.status ?? election.status;

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
    Promise.all(tours.map(async ({ tour: itemTour }) => [itemTour.file, await fetchJson<ElectionCommuneFile>(`/data/elections/${itemTour.file}.json`)] as const))
      .then((entries) => setAllElectionData(Object.fromEntries(entries)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const circoKey = `${dataKey}-circo`;
    if (circoData[circoKey] || election.status !== "reel") return;
    fetchJson<ElectionCircoFile>(`/data/elections/${dataKey}-circo.json`)
      .then((d) => setCircoData((prev) => ({ ...prev, [circoKey]: d })))
      .catch(() => {});
  }, [dataKey, election.status]);

  useEffect(() => {
    const cantonKey = `${dataKey}-canton`;
    if (cantonData[cantonKey] !== undefined || election.status !== "reel") return;
    fetchJson<any>(`/data/elections/${dataKey}-canton.json`)
      .then((d) => setCantonData((prev) => ({ ...prev, [cantonKey]: d })))
      .catch(() => setCantonData((prev) => ({ ...prev, [cantonKey]: null })));
  }, [dataKey, election.status]);

  useEffect(() => {
    if (election.status !== "reel") return;
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
    if (!current || metric === "tete") return [0, 100];
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
      L.control.zoom({ position: "bottomleft" }).addTo(map);
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
      return { color: "#fff", weight: baseWeight, fillColor: info.color, fillOpacity: 0.82 };
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
        snapshots: communeSnapshots,
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
          <p>Résultats, participation et profil sociodémographique — commune, bureau de vote, canton, circonscription</p>
        </div>
        <div className="elec-header-actions">
          <div className="elec-livebox">
            <i />
            <span>
              <strong>Données contrôlées</strong>
              <small>7 scrutins réels · couverture documentée</small>
            </span>
          </div>
        </div>
      </header>
      <div className="elec-progress">
        <span style={{ width: loading ? "40%" : "100%" }} />
      </div>
      <div className="elec-workspace">
        <aside className="elec-sidebar">
          <div className="elec-sidebar-intro">
            <span>LECTURE DE LA CARTE</span>
            <h2>Informations affichées</h2>
          </div>

          <div className="elec-sidebar-block-title">Échelle d’analyse</div>
          <div className="elec-switch-list">
            {SCALES.map((s) => (
              <label
                key={s.id}
                className="elec-switch"
                style={{ "--switch-color": s.id === "commune" ? "#000091" : s.id === "bv" ? "#e1000f" : s.id === "canton" ? "#a558a0" : "#00a95f" } as CSSProperties}
              >
                <input type="radio" name="scale" checked={scale === s.id} onChange={() => { setScale(s.id); resetSelection(); }} />
                <span><strong>{s.label}</strong><small>{s.id === "commune" ? "Lecture territoriale" : s.id === "bv" ? "Résultats les plus fins" : s.id === "canton" ? "21 cantons" : "10 circonscriptions"}</small></span>
              </label>
            ))}
          </div>
          {scale === "bv" && (
            <p className="elec-scale-note">
              Échelle bureau de vote : contours réels (810 bureaux, IGN/INSEE). Cliquez un bureau sur la carte pour sa fiche.
            </p>
          )}
          {scale === "canton" && (
            <p className="elec-scale-note">
              Échelle canton : 21 cantons réels (redécoupage 2015, contours dissous à partir des bureaux de vote — Argenteuil et Cergy
              correctement scindés sur plusieurs cantons). Résultats réels disponibles pour tous les scrutins chargés (agrégation
              directe des résultats communaux ou par bureau, sans donnée inventée).
            </p>
          )}

          <div className="elec-sidebar-block-title">Élection</div>
          <select
            className="elec-select"
            value={electionId}
            onChange={(e) => {
              setElectionId(e.target.value);
              const el = findElection(e.target.value);
              setTourId(el.tours[el.tours.length - 1].id);
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

          {tourStatus === "reel" && (
            <>
              <div className="elec-sidebar-block-title">Informations affichées</div>
              <div className="elec-switch-list">
                {METRICS.map((m) => (
                  <label
                    key={m.id}
                    className="elec-switch"
                    style={{ "--switch-color": m.id === "tete" ? "#000091" : m.id === "score_candidat" ? "#e8a33e" : m.id === "abstention" ? "#a558a0" : "#00a95f" } as CSSProperties}
                  >
                    <input type="radio" name="metric" checked={metric === m.id} onChange={() => setMetric(m.id)} />
                    <span><strong>{m.label}</strong><small>{m.id === "tete" ? "Rapport de forces" : m.id === "score_candidat" ? "% des exprimés" : m.id === "abstention" ? "% des inscrits" : "Votants · inscrits"}</small></span>
                  </label>
                ))}
              </div>
              {metric === "score_candidat" && (
                <select className="elec-select" value={scoreCandidat} onChange={(e) => setScoreCandidat(e.target.value)}>
                  {candidateList.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <Legend metric={metric} scoreCandidat={scoreCandidat} current={current} bounds={metricRange} />
            </>
          )}

          <div className="elec-sidebar-block-title">Couches et export</div>
          <div className="elec-pillgroup cols-1">
            <button type="button" className="elec-pill" onClick={recenter}>
              Recentrer sur le Val-d'Oise
            </button>
            <div className="elec-export-menu">
              <button type="button" className="elec-pill" onClick={() => setExportOpen((o) => !o)}>
                Exporter la couche affichée (GeoJSON)
              </button>
              {exportOpen && (
                <div className="elec-export-menu-list">
                  <button
                    type="button"
                    onClick={() => {
                      exportLayerGeoJSON();
                      setExportOpen(false);
                    }}
                  >
                    Toute la couche « {SCALES.find((s) => s.id === scale)?.label} »
                  </button>
                  {selectedUnit && (
                    <button
                      type="button"
                      onClick={() => {
                        exportFeatureGeoJSON();
                        setExportOpen(false);
                      }}
                    >
                      Uniquement « {selectedUnit.nom} »
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

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
        </aside>

        <section className="elec-map-shell">
          <div ref={mapNode} className="elec-map" aria-label="Carte électorale du Val-d'Oise" />
          {hoveredUnit && <div className="elec-hover-card compact" aria-live="polite"><strong>{hoveredUnit.name}</strong>{hoveredUnit.result ? <><span>{metricInfo(hoveredUnit.result).label}</span><small>Participation {hoveredUnit.result.pct_participation.toFixed(1)} % · cliquez pour la synthèse complète</small></> : <span>Résultat indisponible</span>}</div>}
          {scale === "canton" && election.status === "reel" && !cantonData[`${dataKey}-canton`] && (
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
          {scale === "bv" && election.status === "reel" && !bvData[`${dataKey}-bv`] && (
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
          <div className="elec-hint"><span><strong>Survolez un territoire : tout le portrait se déplace.</strong><small>Cliquez pour ouvrir la fiche complète.</small></span></div>
        </section>

        <aside className={`elec-drawer ${drawerOpen ? "open" : ""}`} aria-label="Fiche du scrutin">
          <div className="elec-drawer-head">
            <small>
              {SCALES.find((s) => s.id === scale)?.label?.toUpperCase()} · {election.shortLabel.toUpperCase()} · {tour.label}
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
                    <p className="elec-context-note">Recensement INSEE 2022. Ces données décrivent les habitants de la commune.</p>
                  </Section>
                )}
                <Section title="Participation" state="Données réelles">
                  <div className="participation-gauge"><span style={{width:`${selectedUnit.pct_participation}%`}}/><b>{selectedUnit.pct_participation.toFixed(1)} %</b></div>
                  <div className="elec-kpis">
                    <Kpi label="Inscrits" value={selectedUnit.inscrits.toLocaleString("fr-FR")} />
                    <Kpi label="Votants" value={selectedUnit.votants.toLocaleString("fr-FR")} />
                    <Kpi label="Abstention" value={`${selectedUnit.pct_abstention.toFixed(1)} %`} />
                    <Kpi label="Participation" value={`${selectedUnit.pct_participation.toFixed(1)} %`} />
                    <Kpi label="Blancs" value={selectedUnit.blancs.toLocaleString("fr-FR")} />
                    <Kpi label="Nuls" value={selectedUnit.nuls.toLocaleString("fr-FR")} />
                  </div>
                </Section>
                {scale === "commune" ? (
                  <>
                    <CommuneSynthesis snapshots={communeSnapshots} mode="results" />
                    <CommuneSynthesis snapshots={communeSnapshots} mode="families" />
                    <CommuneSynthesis snapshots={communeSnapshots} mode="sensitivities" />
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
        <span>Municipales 2026, Présidentielle 2022, Législatives 2024, Européennes 2024, Municipales 2020, Départementales 2021 · données réelles</span>
      </footer>

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
  return (
    <div className="elec-population">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Évolution de la population">
        <polyline points={points} fill="none" stroke="var(--blue, #000091)" strokeWidth={2} />
        {data.map((d, i) => (
          <circle key={d.annee} cx={x(i)} cy={y(d.population)} r={i === data.length - 1 ? 3 : 1.5} fill="var(--blue, #000091)" />
        ))}
      </svg>
      <div className="elec-population-legend">
        <span>
          {first.annee} : <strong>{first.population.toLocaleString("fr-FR")}</strong> hab.
        </span>
        <span>
          {last.annee} : <strong>{last.population.toLocaleString("fr-FR")}</strong> hab.
        </span>
        <span className={delta >= 0 ? "up" : "down"}>
          {delta >= 0 ? "+" : ""}
          {delta.toLocaleString("fr-FR")} ({pct >= 0 ? "+" : ""}
          {pct.toFixed(1)} %) depuis {first.annee}
        </span>
      </div>
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

function CommuneSynthesis({ snapshots, mode }: { snapshots: ElectionSnapshot[]; mode: "results" | "families" | "sensitivities" }) {
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
  const families = [
    { id: "lfi", label: "LFI", color: "#ce0500" }, { id: "social_left", label: "Gauche sociale", color: "#e4287c" },
    { id: "ecologist", label: "Écologistes", color: "#18753c" }, { id: "presidential", label: "Majorité présidentielle", color: "#e8b62f" },
    { id: "lr", label: "LR", color: "#0066cc" }, { id: "rn", label: "RN", color: "#14213d" }, { id: "reconquest", label: "Reconquête", color: "#4b2e83" },
  ];
  if (mode === "sensitivities") return <Section title="Sensibilités" state={`${meaningful.length} scrutins`}>
      <div className="sensitivity-legend">{sensitivities.map((item) => <span key={item.id}><i style={{background:item.color}}/>{item.label}</span>)}</div>
      <div className="sensitivity-history">{meaningful.map((snapshot) => { const scores = politicalScores(snapshot.result, "sensitivity"); return <article key={snapshot.key}><header><strong>{snapshot.election}</strong><span>{snapshot.date.slice(0,4)}</span></header><div>{sensitivities.map((item) => { const value=scores[item.id]??0; return value>0 ? <i key={item.id} style={{width:`${value}%`,background:item.color}} title={`${item.label} : ${value.toFixed(1)} %`}>{value>=9?`${value.toFixed(0)} %`:""}</i>:null;})}</div></article>;})}</div>
      <p className="elec-synthesis-intro">Répartition des suffrages entre les grandes sensibilités. Présidentielles : premier tour ; autres scrutins : dernier tour disponible.</p>
    </Section>;
  if (mode === "families") return <Section title="Évolution des votes" state="Familles politiques">
      <div className="family-lines">{families.map((family) => { const points=meaningful.map(snapshot=>({snapshot,value:politicalScores(snapshot.result,"family")[family.id]})); const comparable=points.filter(point=>point.value!==undefined); const delta=(comparable.at(-1)?.value??0)-(comparable[0]?.value??0); return <article key={family.id} style={{"--family-color":family.color} as CSSProperties}><header><strong>{family.label}</strong><b className={delta>=0?"up":"down"}>{delta>=0?"+":""}{delta.toFixed(1)} pts</b></header><div>{points.map(({snapshot,value})=><span key={snapshot.key}><i style={{height:`${value === undefined ? 0 : Math.max(4,value)}%`}}/><b>{value===undefined?"—":`${value.toFixed(0)} %`}</b><small>{snapshot.election.replace("Présidentielle ","Prés. ").replace("Européennes ","Euro. ").replace("Législatives ","Lég. ").replace("Départementales ","Dép. ").replace("Municipales ","Mun. ")}</small></span>)}</div></article>;})}</div>
      <p className="elec-synthesis-intro">Chaque colonne porte le nom du scrutin. La variation compare les deux présences identifiables de la famille.</p>
    </Section>;
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
