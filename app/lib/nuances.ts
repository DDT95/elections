// Table de correspondance nuance politique -> {libellé, couleur}, utilisée dans toute
// l'application (carte choroplèthe, légende, fiches candidat/liste) pour une lecture
// cohérente et conforme aux conventions habituelles des cartes de soirée électorale des
// médias français (Le Monde, France Info, etc. — couleurs approximatives, non officielles,
// choisies pour rester lisibles sur fond blanc et distinctes deux à deux, notamment entre
// Les Républicains et le Rassemblement National, souvent confondus si tous deux en bleu :
// LR reste au bleu vif traditionnel, le RN passe à un bleu marine très sombre).
//
// Les codes couvrent trois espaces de nommage officiels rencontrés dans nos sources :
//  - candidat individuel (Présidentielle générique, Européennes) : EXG, COM, FI, UG, SOC,
//    RDG, DVG, ECO, ENS, REM, UDI, MDM, LR, DVD, RN, REC, EXD, DIV, NC, REG...
//  - liste municipale ("L" + code, ex. LFI, LRN, LECO — nomenclature officielle du
//    Ministère de l'Intérieur pour les nuances de listes municipales) ;
//  - binôme départemental ("BC-" + code, "BC" = Binôme Candidat, ex. BC-RN, BC-LR).
// Un même code peut donc apparaître trois fois (RN / LRN / BC-RN) : les trois pointent
// vers la même famille et la même couleur.
export type NuanceFamily = {
  label: string;
  color: string;
  codes: string[];
};

export const NUANCE_FAMILIES: NuanceFamily[] = [
  { label: "Extrême gauche", color: "#7A0C0C", codes: ["EXG", "LEXG", "BC-EXG"] },
  { label: "Parti communiste", color: "#D2001F", codes: ["COM", "LCOM", "BC-COM"] },
  { label: "La France insoumise", color: "#CE0500", codes: ["FI", "LFI"] },
  { label: "Union de la gauche", color: "#E4287C", codes: ["UG", "LUG", "UGE", "BC-UG", "BC-UGE"] },
  { label: "Gauche (PS, radicaux de gauche)", color: "#D6467A", codes: ["SOC", "LSOC", "BC-SOC", "RDG", "BC-RDG"] },
  { label: "Divers gauche", color: "#B85D8C", codes: ["DVG", "LDVG", "BC-DVG"] },
  { label: "Écologiste", color: "#18753C", codes: ["ECO", "LECO", "VEC", "LVEC", "BC-ECO"] },
  { label: "Majorité présidentielle", color: "#FFD666", codes: ["ENS", "LENS", "REM", "LREM", "BC-REM"] },
  { label: "Centre", color: "#3FA7B3", codes: ["UDI", "LUD", "MDM", "LMDM", "LUC", "UC", "BC-UDI", "BC-UC", "BC-UCD", "BC-UD"] },
  { label: "Droite républicaine", color: "#0066CC", codes: ["LR", "LLR", "DR", "BC-LR"] },
  { label: "Divers droite", color: "#4D82C7", codes: ["DVD", "LDVD", "DVC", "LDVC", "BC-DVD", "BC-DVC"] },
  { label: "Rassemblement national", color: "#14213D", codes: ["RN", "LRN", "BC-RN"] },
  { label: "Reconquête / droite radicale", color: "#4B2E83", codes: ["REC", "LREC", "EXD", "LEXD", "UXD"] },
  { label: "Divers / sans étiquette", color: "#8B93A1", codes: ["DIV", "LDIV", "NC", "LNC", "REG", "DSV", "BC-DIV"] },
];

const CODE_TO_FAMILY = new Map<string, { label: string; color: string }>();
for (const fam of NUANCE_FAMILIES) {
  for (const code of fam.codes) CODE_TO_FAMILY.set(code, { label: fam.label, color: fam.color });
}

const FALLBACK = { label: "Nuance non répertoriée", color: "#8B93A1" };

/** Résout un code de nuance brut (candidat, liste "L...", ou binôme "BC-...") vers son
 * libellé de famille politique et sa couleur canonique. Code absent de la table -> gris
 * neutre plutôt qu'une couleur inventée. */
export function nuanceInfo(code: string | null | undefined): { label: string; color: string } {
  if (!code) return FALLBACK;
  return CODE_TO_FAMILY.get(code.toUpperCase().trim()) ?? FALLBACK;
}
