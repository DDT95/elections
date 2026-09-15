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
  const [inseeStatus, setInseeStatus] = useState<"a_completer" | "reel">("a_completer");
  const [populationData, setPopulationData] = useState<Record<string, { annee: number; population: number }[]>>({});

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
      fetchJson<any>("/data/insee/insee-95-communes.json").catch(() => ({ status: "a_completer" })),
      fetchJson<any>("/data/insee/population-historique-95.json").catch(() => null),
    ])
      .then(([communes, circo, bv, canton, mask, insee, population]) => {
        setCommunesGeo(communes);
        setCircoGeo(circo);
        setBvGeo(bv);
        setCantonGeo(canton);
        setMaskGeo(mask);
        setInseeStatus(insee.status || "a_completer");
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
      return { value: cd.pct_exprimes, color: sequentialColor(cd.pct_exprimes, 0, 50), label: `${cd.pct_exprimes.toFixed(1)} %` };
    }
    if (metric === "abstention") {
      return { value: u.pct_abstention, color: sequentialColor(u.pct_abstention, 10, 45), label: `${u.pct_abstention.toFixed(1)} %` };
    }
    return { value: u.pct_participation, color: sequentialColor(u.pct_participation, 55, 90), label: `${u.pct_participation.toFixed(1)} %` };
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
  const portraitUnit = hoveredUnit?.result ?? selectedUnit ?? (scale === "commune" ? current?.communes["95127"] : null);
  const portraitName = hoveredUnit?.name ?? selectedUnit?.nom ?? (scale === "commune" ? current?.communes["95127"]?.nom : null);
  const portraitCode = hoveredUnit ? "Survol" : selectedCode ?? (scale === "commune" ? "95127" : "");
  const portraitRunnerUp = portraitUnit?.candidats?.[1];
  const portraitGap = portraitUnit?.tete && portraitRunnerUp
    ? portraitUnit.tete.pct_exprimes - portraitRunnerUp.pct_exprimes
    : null;

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
              Données à compléter pour ce tour : la structure est prête mais aucun résultat réel n'est chargé (voir DATA.md).
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
              <Legend metric={metric} scoreCandidat={scoreCandidat} current={current} />
            </>
          )}

          <div className="elec-sidebar-block-title">Croisement sociodémographique</div>
          {inseeStatus === "a_completer" ? (
            <p className="elec-scale-note warn">
              Données INSEE (âge, CSP) à compléter — voir DATA.md pour le détail. La structure de croisement est prête et s'activera
              automatiquement dès l'intégration des fichiers INSEE RP.
            </p>
          ) : (
            <p className="elec-scale-note">Croisement disponible.</p>
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
          {portraitUnit && (
            <div className="elec-orbit" aria-live="polite">
              <article className="elec-orbit-card result">
                <h3>Résultat</h3>
                <span>En tête</span>
                <strong className="candidate-name">{portraitUnit.tete ? `${portraitUnit.tete.prenom ?? ""} ${portraitUnit.tete.nom ?? ""}` : "Non disponible"}</strong>
                <b>{portraitUnit.tete ? `${portraitUnit.tete.pct_exprimes.toFixed(1)} %` : "—"}</b>
                <small>{portraitUnit.tete?.nuance ?? "Nuance non renseignée"}</small>
              </article>
              <article className="elec-orbit-card participation">
                <h3>Participation</h3>
                <span>Part des inscrits ayant voté</span>
                <strong>{portraitUnit.pct_participation.toFixed(1)} %</strong>
                <i className="participation-track"><em style={{ width: `${portraitUnit.pct_participation}%` }} /></i>
                <small>{portraitUnit.votants.toLocaleString("fr-FR")} votants sur {portraitUnit.inscrits.toLocaleString("fr-FR")} inscrits</small>
              </article>
              <div className="elec-focus-label"><strong>{portraitName}</strong><span>Sous la loupe · {portraitCode}</span></div>
              <article className="elec-orbit-card electorate">
                <h3>Corps électoral</h3>
                <div><span>Inscrits<strong>{portraitUnit.inscrits.toLocaleString("fr-FR")}</strong><small>{portraitUnit.exprimes.toLocaleString("fr-FR")} exprimés</small></span><span>Abstention<strong>{portraitUnit.pct_abstention.toFixed(1)} %</strong><small>{portraitUnit.abstentions.toLocaleString("fr-FR")} personnes</small></span><span>Écart entre les deux premiers<strong>{portraitGap === null ? "—" : `${portraitGap.toFixed(1)} pts`}</strong><small>Lecture du rapport de forces</small></span></div>
                <button type="button" onClick={() => portraitCode !== "Survol" && setSelectedCode(portraitCode)}>Voir toutes les données</button>
              </article>
            </div>
          )}
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
                Résultats par canton non disponibles pour ce scrutin (voir DATA.md).
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
                Résultats par bureau de vote non disponibles pour ce scrutin (voir DATA.md).
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
                <Section title="Participation" state="Données réelles">
                  <div className="elec-kpis">
                    <Kpi label="Inscrits" value={selectedUnit.inscrits.toLocaleString("fr-FR")} />
                    <Kpi label="Votants" value={selectedUnit.votants.toLocaleString("fr-FR")} />
                    <Kpi label="Abstention" value={`${selectedUnit.pct_abstention.toFixed(1)} %`} />
                    <Kpi label="Participation" value={`${selectedUnit.pct_participation.toFixed(1)} %`} />
                    <Kpi label="Blancs" value={selectedUnit.blancs.toLocaleString("fr-FR")} />
                    <Kpi label="Nuls" value={selectedUnit.nuls.toLocaleString("fr-FR")} />
                  </div>
                </Section>
                <Section title="Résultats par candidat" state={selectedUnit.candidats.length ? `${selectedUnit.candidats.length} candidats` : "À compléter"}>
                  {selectedUnit.candidats.length ? (
                    <CandidateTable candidats={selectedUnit.candidats} />
                  ) : (
                    <p className="elec-empty">Détail par liste/candidat non chargé pour ce scrutin (participation réelle disponible ci-dessus). Voir DATA.md.</p>
                  )}
                </Section>
                {scale === "commune" && (
                  <Section
                    title="Évolution de la population"
                    state={selectedCode && populationData[selectedCode]?.length ? "Données réelles (INSEE)" : "À compléter"}
                  >
                    {selectedCode && populationData[selectedCode]?.length ? (
                      <PopulationSparkline data={populationData[selectedCode]} />
                    ) : (
                      <p className="elec-empty">
                        Population historique non disponible pour cette commune dans le jeu de données INSEE (voir DATA.md).
                      </p>
                    )}
                  </Section>
                )}
                <Section title="Croisement sociodémographique" state={inseeStatus === "a_completer" ? "À compléter" : "Disponible"}>
                  {inseeStatus === "a_completer" ? (
                    <p className="elec-empty">
                      Le croisement âge / catégorie socioprofessionnelle nécessite l'intégration des fichiers INSEE RP au niveau
                      communal (voir DATA.md pour le plan d'intégration).
                    </p>
                  ) : (
                    <p className="elec-empty">Aucune donnée.</p>
                  )}
                </Section>
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

function Legend({ metric, scoreCandidat, current }: { metric: MetricId; scoreCandidat: string; current?: ElectionCommuneFile }) {
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
  const bounds = metric === "abstention" ? [10, 45] : metric === "participation" ? [55, 90] : [0, 50];
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

// Liste de résultats sous forme de cartes colorées par nuance (plutôt qu'un tableau plat) :
// liseré et pastille de couleur à gauche = famille politique (app/lib/nuances.ts), barre
// proportionnelle au score, trophée sur la tête de liste/candidat arrivé en tête. Reste
// sobre (pas de logo de parti, jamais utilisé — voir DATA.md) tout en donnant une lecture
// plus immédiate qu'un tableau pour un scrutin à de nombreuses listes (municipales).
function CandidateTable({ candidats }: { candidats: UnitResult["candidats"] }) {
  const max = Math.max(...candidats.map((c) => c.pct_exprimes), 1);
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
              <div className="elec-cand-bar-fill" style={{ width: `${(c.pct_exprimes / max) * 100}%`, background: color }} />
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
