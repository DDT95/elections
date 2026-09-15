export type Candidat = {
  nom: string | null;
  prenom: string | null;
  nuance: string | null;
  voix: number;
  pct_exprimes: number;
  pct_inscrits: number;
};

export type UnitResult = {
  code_insee?: string;
  code_circonscription?: string | null;
  nom: string;
  bureaux_de_vote?: number;
  nb_communes?: number;
  inscrits: number;
  abstentions: number;
  votants: number;
  blancs: number;
  nuls: number;
  exprimes: number;
  pct_abstention: number;
  pct_participation: number;
  candidats: Candidat[];
  tete?: { nom: string | null; prenom: string | null; nuance: string | null; pct_exprimes: number };
};

export type ElectionCommuneFile = {
  election: string;
  tour: number;
  date: string;
  label?: string;
  status: "publie" | "a_completer";
  note?: string;
  source?: { producer: string; dataset: string; url: string };
  communes: Record<string, UnitResult>;
};

export type ElectionCircoFile = {
  election: string;
  tour: number;
  date: string;
  status: "publie" | "a_completer";
  note?: string;
  circonscriptions: Record<string, UnitResult>;
};

export type Scale = "commune" | "bv" | "canton" | "circonscription";

export type ElectionDef = {
  id: string;
  label: string;
  shortLabel: string;
  tours: { id: string; label: string; file: string }[];
  status: "publie" | "a_completer";
};

export type MetricId = "tete" | "score_candidat" | "abstention" | "participation";
