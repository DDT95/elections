/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import { ELECTIONS, findElection } from "./lib/elections";
import { colorForCandidate, sequentialColor, SEQUENTIAL_STEPS } from "./lib/color";
import type { ElectionCircoFile, ElectionCommuneFile, MetricId, Scale, UnitResult } from "./lib/types";
import electionSources from "../config/election-sources.json";

const ATLAS_URL = "https://ddt95.github.io/atlas-territorial-95/";
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

  const [scale, setScale] = useState<Scale>("commune");
  const [electionId, setElectionId] = useState("pres-2022");
  const [tourId, setTourId] = useState("t2");
  const [metric, setMetric] = useState<MetricId>("tete");
  const [scoreCandidat, setScoreCandidat] = useState<string>("");

  const [communesGeo, setCommunesGeo] = useState<any>(null);
  const [circoGeo, setCircoGeo] = useState<any>(null);
  const [bvGeo, setBvGeo] = useState<any>(null);
  const [electionData, setElectionData] = useState<Record<string, ElectionCommuneFile>>({});
  const [circoData, setCircoData] = useState<Record<string, ElectionCircoFile>>({});
  const [bvData, setBvData] = useState<Record<string, any>>({});
  const [inseeStatus, setInseeStatus] = useState<"a_completer" | "reel">("a_completer");

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const sourceDialog = useRef<HTMLDialogElement>(null);

  const election = findElection(electionId);
  const tour = election.tours.find((t) => t.id === tourId) ?? election.tours[0];
  const dataKey = tour.file;
  const current = electionData[dataKey];

  // ---- Chargement des données statiques ----
  useEffect(() => {
    setSources(electionSources as SourceEntry[]);
    Promise.all([
      fetchJson<any>("/data/geo/communes-95.geojson"),
      fetchJson<any>("/data/geo/circonscriptions-95.geojson"),
      fetchJson<any>("/data/geo/bureaux-vote-95.geojson").catch(() => null),
      fetchJson<any>("/data/insee/insee-95-communes.json").catch(() => ({ status: "a_completer" })),
    ])
      .then(([communes, circo, bv, insee]) => {
        setCommunesGeo(communes);
        setCircoGeo(circo);
        setBvGeo(bv);
        setInseeStatus(insee.status || "a_completer");
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
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "elec-neutral-tiles",
        attribution: "© OpenStreetMap",
      }).addTo(map);
      setForceRedraw((n) => n + 1);
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

  const [, setForceRedraw] = useState(0);

  // ---- Détermination des valeurs par unité selon métrique ----
  function metricInfo(u: UnitResult): { value: number | null; color: string; label: string } {
    if (metric === "tete") {
      const t = u.tete;
      if (!t) return { value: null, color: "#c7cfda", label: "—" };
      return { value: t.pct_exprimes, color: colorForCandidate(t.nom), label: `${t.prenom ?? ""} ${t.nom ?? ""} · ${t.pct_exprimes.toFixed(1)} %` };
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
    if (!L || !map) return;
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (scale === "canton") return; // pas de contours pour cette échelle dans cette version
    if (scale === "bv") {
      const bvBureaux = bvData[`${dataKey}-bv`]?.bureaux;
      if (!bvGeo || !bvBureaux) return;
      const layer = L.geoJSON(bvGeo, {
        style: (feature: any) => {
          const code = feature.properties.codeBureauVote;
          const b = bvBureaux[code];
          const info = b ? metricInfo(normalizeBureau(b)) : null;
          return { color: "#fff", weight: 0.5, fillColor: info?.color ?? "#e9edf3", fillOpacity: info ? 0.82 : 0.35 };
        },
        onEachFeature: (feature: any, lyr: any) => {
          const code = feature.properties.codeBureauVote;
          const b = bvBureaux[code];
          const name = `${feature.properties.nomCommune} — bureau ${feature.properties.numeroBureauVote}`;
          lyr.bindTooltip(b ? `<b>${name}</b><br/>${metricInfo(normalizeBureau(b)).label}` : `${name}<br/>Pas de résultat`, {
            sticky: true,
            className: "elec-tooltip",
          });
          lyr.on("click", () => setSelectedCode(code));
          lyr.on("mouseover", () => lyr.setStyle({ weight: 1.8, color: "#000091" }));
          lyr.on("mouseout", () => lyr.setStyle({ weight: 0.5, color: "#fff" }));
        },
      }).addTo(map);
      layerRef.current = layer;
      return;
    }
    const geo = scale === "circonscription" ? circoGeo : communesGeo;
    const dataset = scale === "circonscription" ? circoData[`${dataKey}-circo`]?.circonscriptions : current?.communes;
    if (!geo || !dataset) return;

    const layer = L.geoJSON(geo, {
      style: (feature: any) => {
        const code = scale === "circonscription" ? feature.properties.code_circonscription : feature.properties.code;
        const u = dataset[code];
        const info = u ? metricInfo(u) : { color: "#e9edf3" };
        return { color: "#fff", weight: scale === "circonscription" ? 1.4 : 0.8, fillColor: info.color, fillOpacity: 0.82 };
      },
      onEachFeature: (feature: any, lyr: any) => {
        const code = scale === "circonscription" ? feature.properties.code_circonscription : feature.properties.code;
        const u = dataset[code];
        const name = feature.properties.nom;
        lyr.bindTooltip(u ? `<b>${name}</b><br/>${metricInfo(u).label}` : name, { sticky: true, className: "elec-tooltip" });
        lyr.on("click", () => setSelectedCode(code));
        lyr.on("mouseover", () => lyr.setStyle({ weight: 2.4, color: "#000091" }));
        lyr.on("mouseout", () => lyr.setStyle({ weight: scale === "circonscription" ? 1.4 : 0.8, color: "#fff" }));
      },
    }).addTo(map);
    layerRef.current = layer;
  }, [scale, communesGeo, circoGeo, bvGeo, bvData, current, circoData, dataKey, metric, scoreCandidat]);

  const selectedUnit: UnitResult | null = useMemo(() => {
    if (!selectedCode) return null;
    if (scale === "circonscription") return circoData[`${dataKey}-circo`]?.circonscriptions[selectedCode] ?? null;
    if (scale === "bv") {
      const b = bvData[`${dataKey}-bv`]?.bureaux?.[selectedCode];
      return b ? normalizeBureau(b) : null;
    }
    return current?.communes[selectedCode] ?? null;
  }, [selectedCode, scale, current, circoData, bvData, dataKey]);

  const drawerOpen = !!selectedUnit;

  function resetSelection() {
    setSelectedCode(null);
  }

  function recenter() {
    if (mapRef.current && initialBoundsRef.current) {
      mapRef.current.fitBounds(initialBoundsRef.current, { padding: [8, 8] });
    }
  }

  // ---- Export GeoJSON ----
  function layerGeoAndCodeOf(f: any): string {
    if (scale === "circonscription") return f.properties.code_circonscription;
    if (scale === "bv") return f.properties.codeBureauVote;
    return f.properties.code;
  }

  function exportLayerGeoJSON() {
    const geo = scale === "circonscription" ? circoGeo : scale === "bv" ? bvGeo : communesGeo;
    if (!geo) return;
    const dataset =
      scale === "circonscription"
        ? circoData[`${dataKey}-circo`]?.circonscriptions
        : scale === "bv"
          ? bvData[`${dataKey}-bv`]?.bureaux
          : current?.communes;
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
    const geo = scale === "circonscription" ? circoGeo : scale === "bv" ? bvGeo : communesGeo;
    const feature = geo?.features.find((f: any) => layerGeoAndCodeOf(f) === selectedCode);
    if (!feature) return;
    downloadBlob(`${selectedUnit.nom}-${dataKey}.geojson`, JSON.stringify({ type: "Feature", ...feature, properties: { ...feature.properties, resultats: selectedUnit } }), "application/geo+json");
  }

  // ---- Impression ----
  function printUnit() {
    if (!selectedUnit) return;
    (window as any).electionsPrintApp = {
      analysis: {
        scale,
        code: selectedCode,
        unit: selectedUnit,
        election: election.label,
        tourLabel: tour.label,
      },
    };
    window.open(`${basePath}/print.html`, "_blank", "noopener");
  }

  return (
    <main className="elec-page">
      <header className="elec-header">
        <a href={ATLAS_URL} target="_blank" rel="noreferrer" aria-label="Ouvrir l'Atlas territorial du Val-d'Oise">
          <img src={`${basePath}/prefet-val-doise-logo.png`} alt="Préfet du Val-d'Oise" />
        </a>
        <div className="elec-header-copy">
          <span>ATLAS ÉLECTORAL</span>
          <h1>Atlas électoral du Val-d'Oise</h1>
          <p>Résultats, participation et profil sociodémographique — commune, bureau de vote, canton, circonscription</p>
        </div>
        <div className="elec-header-actions">
          <a className="elec-backlink" href={ATLAS_URL} target="_blank" rel="noreferrer">
            ← Retour à l'Atlas
          </a>
          <div className="elec-livebox">
            <i />
            <span>
              <strong>Données contrôlées</strong>
              <small>4 scrutins réels · bureaux de vote géolocalisés</small>
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
            <span>LECTURE CARTOGRAPHIQUE</span>
            <h2>
              Analyser
              <br />
              un scrutin
            </h2>
          </div>

          <div className="elec-sidebar-block-title">Échelle</div>
          <div className="elec-pillgroup">
            {SCALES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`elec-pill ${scale === s.id ? "active" : ""}`}
                onClick={() => {
                  setScale(s.id);
                  resetSelection();
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          {scale === "bv" && (
            <p className="elec-scale-note">
              Échelle bureau de vote : contours réels (810 bureaux, IGN/INSEE). Cliquez un bureau sur la carte pour sa fiche.
            </p>
          )}
          {scale === "canton" && (
            <p className="elec-scale-note warn">
              Échelle canton : structure prête, contours et résultats à compléter (référentiel cantonal non intégré dans cette version).
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
          {election.status === "a_completer" && (
            <p className="elec-scale-note warn">
              Données à compléter pour ce scrutin : la structure est prête mais aucun résultat réel n'est chargé (voir DATA.md).
            </p>
          )}

          {election.status === "reel" && scale !== "canton" && (
            <>
              <div className="elec-sidebar-block-title">Indicateur cartographié</div>
              <div className="elec-pillgroup cols-1">
                {METRICS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`elec-pill ${metric === m.id ? "active" : ""}`}
                    onClick={() => setMetric(m.id)}
                  >
                    {m.label}
                  </button>
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
          {scale === "canton" && (
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
                Échelle canton : contours et résultats à compléter.
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
          <div className="elec-hint">
            <i />
            <span>
              <strong>{drawerOpen ? "Fiche disponible" : "Sélectionnez une unité"}</strong>
              <small>{drawerOpen ? selectedUnit?.nom : "Cliquez sur la carte ou choisissez un bureau"}</small>
            </span>
          </div>
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
              <div className="elec-actions">
                <button onClick={printUnit}>Imprimer la fiche</button>
                <a href="#" onClick={(e) => { e.preventDefault(); exportFeatureGeoJSON(); }}>
                  Exporter GeoJSON
                </a>
              </div>
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
              </div>
            </>
          )}
        </aside>
      </div>
      <footer className="elec-footer">
        <span>Atlas électoral du Val-d'Oise — DDT 95 · module de l'Atlas territorial</span>
        <span>Présidentielle 2022, Législatives 2024, Européennes 2024, Municipales 2020 · données réelles</span>
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
    const leaders = new Map<string, string>();
    if (current) {
      Object.values(current.communes).forEach((c) => {
        if (c.tete?.nom) leaders.set(c.tete.nom, colorForCandidate(c.tete.nom));
      });
    }
    return (
      <div className="elec-legend">
        <p className="elec-legend-title">Légende — tête de liste</p>
        <div className="elec-legend-swatches">
          {Array.from(leaders.entries()).map(([nom, color]) => (
            <div key={nom} className="elec-legend-swatch">
              <i style={{ background: color }} /> {nom}
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

function CandidateTable({ candidats }: { candidats: UnitResult["candidats"] }) {
  const max = Math.max(...candidats.map((c) => c.pct_exprimes), 1);
  return (
    <table className="elec-table">
      <thead>
        <tr>
          <th>Candidat</th>
          <th>Voix</th>
          <th>% exprimés</th>
        </tr>
      </thead>
      <tbody>
        {candidats.map((c, i) => (
          <tr key={i} className={i === 0 ? "lead" : ""}>
            <td>
              {c.prenom} {c.nom}
              <br />
              <span className="elec-candidate-bar" style={{ width: `${(c.pct_exprimes / max) * 60}px`, background: colorForCandidate(c.nom) }} />
            </td>
            <td className="num">{c.voix.toLocaleString("fr-FR")}</td>
            <td className="num">{c.pct_exprimes.toFixed(2)} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
