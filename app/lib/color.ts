// Palette pour les nuances politiques (approximation usuelle des couleurs de presse
// française, utilisée uniquement pour la lecture cartographique — non officielle).
const CANDIDATE_COLORS: Record<string, string> = {
  ARTHAUD: "#8b0000",
  MÉLENCHON: "#dd3333",
  ROUSSEL: "#b02020",
  HIDALGO: "#e8a0b0",
  JADOT: "#2e7d32",
  MACRON: "#f6c700",
  LASSALLE: "#8a5a30",
  PÉCRESSE: "#0057b7",
  DUPONT_AIGNAN: "#2255aa",
  "DUPONT-AIGNAN": "#2255aa",
  ZEMMOUR: "#5b2ca0",
  "LE PEN": "#0b3d91",
  POUTOU: "#a1272f",
};

export function colorForCandidate(nom: string | null | undefined): string {
  if (!nom) return "#8892a0";
  return CANDIDATE_COLORS[nom.toUpperCase()] || "#8892a0";
}

// Échelle séquentielle bleu (faible -> fort) pour abstention / participation / score.
const SEQUENTIAL = ["#eef1ff", "#c9d3fb", "#9fabf3", "#6d7ce6", "#3f4cc9", "#1b1f8f"];

export function sequentialColor(value: number, min: number, max: number): string {
  if (max <= min) return SEQUENTIAL[2];
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const idx = Math.min(SEQUENTIAL.length - 1, Math.floor(t * SEQUENTIAL.length));
  return SEQUENTIAL[idx];
}

export const SEQUENTIAL_STEPS = SEQUENTIAL;
