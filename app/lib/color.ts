import { nuanceInfo } from "./nuances";

// Repli par nom de famille pour les scrutins dont la source ne porte pas de code de
// nuance exploitable (Présidentielle 2022 : les fichiers ne renseignent que le nom du
// candidat). Couleurs alignées sur la même convention presse que app/lib/nuances.ts.
const CANDIDATE_COLORS: Record<string, string> = {
  ARTHAUD: "#7A0C0C",
  MÉLENCHON: "#CE0500",
  ROUSSEL: "#D2001F",
  HIDALGO: "#FF8AA6",
  JADOT: "#18753C",
  MACRON: "#FFD666",
  LASSALLE: "#8B93A1",
  PÉCRESSE: "#0066CC",
  DUPONT_AIGNAN: "#4B2E83",
  "DUPONT-AIGNAN": "#4B2E83",
  ZEMMOUR: "#4B2E83",
  "LE PEN": "#14213D",
  POUTOU: "#7A0C0C",
};

/** Couleur d'un candidat/liste : priorité au code de nuance officiel (résolu via
 * app/lib/nuances.ts) quand la source en porte un, sinon repli sur le nom (utile pour la
 * Présidentielle 2022, seul scrutin de l'Atlas sans code de nuance dans sa source), sinon
 * gris neutre — jamais de couleur inventée sans un de ces deux signaux réels. */
export function colorForCandidate(nom: string | null | undefined, nuance?: string | null): string {
  if (nuance) {
    const info = nuanceInfo(nuance);
    if (info.label !== "Nuance non répertoriée") return info.color;
  }
  if (!nom) return "#8892a0";
  return CANDIDATE_COLORS[nom.toUpperCase()] || "#8892a0";
}

// Échelle séquentielle bleu (faible -> fort) pour abstention / participation / score.
const SEQUENTIAL = ["#eef1ff", "#c9d3fb", "#9fabf3", "#6d7ce6", "#3f4cc9", "#1b1f8f"];

export function sequentialColor(value: number, min: number, max: number): string {
  if (max <= min) return SEQUENTIAL[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const start = [238, 241, 255];
  const end = [27, 31, 143];
  const rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * t));
  return `rgb(${rgb.join(",")})`;
}

export const SEQUENTIAL_STEPS = SEQUENTIAL;
