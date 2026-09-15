import type { ElectionDef } from "./types";

// Panorama complet : chaque élection peut être enrichie plus tard en ajoutant
// simplement une entrée ici et le fichier de données correspondant dans
// public/data/elections/. Les scrutins marqués "a_completer" ont leur
// structure de données prête mais aucun résultat réel encore chargé.
export const ELECTIONS: ElectionDef[] = [
  {
    id: "municipales-2026",
    label: "Municipales 2026",
    shortLabel: "Municipales 2026",
    status: "reel",
    tours: [
      { id: "t1", label: "1er tour (15 mars 2026)", file: "municipales-2026-t1" },
      { id: "t2", label: "2nd tour (23 mars 2026)", file: "municipales-2026-t2" },
    ],
  },
  {
    id: "pres-2022",
    label: "Présidentielle 2022",
    shortLabel: "Présidentielle 2022",
    status: "reel",
    tours: [
      { id: "t1", label: "1er tour (10 avril 2022)", file: "pres-2022-t1" },
      { id: "t2", label: "2nd tour (24 avril 2022)", file: "pres-2022-t2" },
    ],
  },
  {
    id: "legislatives-2024",
    label: "Législatives 2024",
    shortLabel: "Législatives 2024",
    status: "reel",
    tours: [
      { id: "t1", label: "1er tour (30 juin 2024)", file: "legislatives-2024-t1" },
      { id: "t2", label: "2nd tour (7 juillet 2024)", file: "legislatives-2024-t2" },
    ],
  },
  {
    id: "europeennes-2024",
    label: "Européennes 2024",
    shortLabel: "Européennes 2024",
    status: "reel",
    tours: [{ id: "t1", label: "9 juin 2024", file: "europeennes-2024" }],
  },
  {
    id: "departementales-2021",
    label: "Départementales 2021",
    shortLabel: "Départementales 2021",
    status: "reel",
    tours: [
      { id: "t1", label: "1er tour (20 juin 2021)", file: "departementales-2021-t1" },
      { id: "t2", label: "2nd tour (27 juin 2021)", file: "departementales-2021-t2" },
    ],
  },
  {
    id: "municipales-2020",
    label: "Municipales 2020",
    shortLabel: "Municipales 2020",
    status: "reel",
    tours: [
      { id: "t1", label: "1er tour (15 mars 2020)", file: "municipales-2020-t1" },
      { id: "t2", label: "2nd tour (28 juin 2020)", file: "municipales-2020-t2" },
    ],
  },
];

export function findElection(id: string) {
  return ELECTIONS.find((e) => e.id === id) ?? ELECTIONS[0];
}
