import type { UnitResult } from './types';

export type Result = UnitResult & {
  quality?: 'complete' | 'partial' | 'multi_vote';
  mixed_contests?: boolean;
  partial_scope?: boolean;
  code_canton?: string;
  nb_bureaux_attendus?: number;
  nom_commune?: string;
};
export type ResultsFile = { election: string; tour: number; date: string; note?: string; communes?: Record<string, Result>; bureaux?: Record<string, Result>; cantons?: Record<string, Result>; circonscriptions?: Record<string, Result> };
export const number = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
export const percent = (n: number | null) => n === null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
export const ratio = (n: number, d: number) => d > 0 ? 100 * n / d : null;
export const points = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} pt${Math.abs(n) === 1 ? '' : 's'}`;
export const candidateKey = (c: { nom: string | null; prenom: string | null }) => JSON.stringify([c.nom ?? '', c.prenom ?? '']);
export const normalText = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function totals(units: Result[]) {
  const sum = (key: 'inscrits' | 'votants' | 'abstentions' | 'exprimes' | 'blancs' | 'nuls') => units.reduce((n, u) => n + u[key], 0);
  const inscrits = sum('inscrits'), votants = sum('votants');
  return { inscrits, votants, abstentions: sum('abstentions'), exprimes: sum('exprimes'), blancs: sum('blancs'), nuls: sum('nuls'), participation: ratio(votants, inscrits) };
}

export function canReadLeader(u: Result) {
  return u.quality === 'complete' && !u.mixed_contests && !!u.candidats.length;
}

export function statusLabel(u: Result) {
  if (u.quality === 'multi_vote') return 'Scrutin à plusieurs votes possibles';
  if (u.quality === 'partial') return 'Détail candidat incomplet';
  if (u.partial_scope) return 'Périmètre partiel à ce tour';
  if (u.mixed_contests) return 'Plusieurs élections locales';
  return 'Résultat complet';
}

export function mergeResults(a: Result, b: Result): Result {
  const t = totals([a,b]);
  const candidates = new Map<string, Result['candidats'][number]>();
  for (const c of [...a.candidats,...b.candidats]) {
    const key = candidateKey(c);
    candidates.set(key, {...c, voix: (candidates.get(key)?.voix ?? 0) + c.voix});
  }
  return { ...a, ...t, nom: 'Commeny (avec Gouzangrez)', pct_participation: t.participation ?? 0, pct_abstention: ratio(t.abstentions,t.inscrits) ?? 0,
    candidats: [...candidates.values()], partial_scope: a.partial_scope || b.partial_scope,
    bureaux_de_vote: (a.bureaux_de_vote ?? 0)+(b.bureaux_de_vote ?? 0) };
}

/** Stable commune geography for comparisons, never compare a partial second-tour commune. */
export function harmonize(units: Record<string, Result>): Record<string, Result> {
  const result = {...units};
  if (result['95282']) {
    if (result['95169']) result['95169'] = mergeResults(result['95169'], result['95282']);
    else result['95169'] = {...result['95282'], nom:'Commeny (périmètre partiel)', partial_scope:true};
    delete result['95282'];
  }
  return result;
}

export function compareCommunes(a: Record<string, Result>, b: Record<string, Result>) {
  const aa=harmonize(a), bb=harmonize(b);
  return Object.entries(aa).flatMap(([code,left]) => {
    const right=bb[code];
    if (!right || left.partial_scope || right.partial_scope || !left.inscrits || !right.inscrits) return [];
    return [{code, nom: right.nom, left, right, delta: 100*right.votants/right.inscrits-100*left.votants/left.inscrits}];
  });
}

export type ContextFile = { status: string; producer: string; source: string; note: string; bureaux: Record<string, Record<string, number | null>> };
export function contextFor(context: ContextFile | null, codes: string[]) {
  if (!context) return null;
  const rows = codes.map(code => context.bureaux[code]).filter(Boolean);
  if (!rows.length) return null;
  function sum(keys: string[]) {
    if (rows.some(r=>keys.some(k=>r[k] == null))) return null;
    return rows.reduce((s,r)=>s+keys.reduce((t,k)=>t+(r[k] ?? 0),0),0);
  }
  function rate(n: string[],d: string[]) { const nn=sum(n),dd=sum(d);return nn===null||dd===null?null:ratio(nn,dd); }
  return { covered:rows.length, total:codes.length,
    youth:rate(['P_POP1524'],['P_POP']), senior:rate(['P_POP6579','P_POP80P'],['P_POP']),
    cadres:rate(['C_POP15P_CS3'],Array.from({length:8},(_,i)=>`C_POP15P_CS${i+1}`)),
    workers:rate(['C_POP15P_CS6'],Array.from({length:8},(_,i)=>`C_POP15P_CS${i+1}`)),
    graduates:rate(['P_NSCOL15P_SUP2','P_NSCOL15P_SUP34','P_NSCOL15P_SUP5'],['P_NSCOL15P']) };
}

export function download(filename: string, content: string, type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csvCell(value: unknown) {
  const s=String(value ?? '');
  return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';
}
