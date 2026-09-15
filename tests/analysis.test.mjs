import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {totals,compareCommunes,harmonize,contextFor,canReadLeader,csvCell,ratio} from '../app/lib/analysis.ts';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const unit=(inscrits,votants,more={})=>({nom:'Test',inscrits,votants,abstentions:inscrits-votants,exprimes:votants,blancs:0,nuls:0,candidats:[],pct_participation:100*votants/inscrits,...more});
test('le taux global est pondéré, pas moyenné',()=>{assert.equal(totals([unit(100,80),unit(900,450)]).participation,53);assert.equal(ratio(0,0),null);});
test('comparaison : intersection et exclusion des seconds tours partiels',()=>{const a={A:unit(100,50),B:unit(100,30),C:unit(100,20)};const b={A:unit(200,120),B:unit(100,80,{partial_scope:true}),D:unit(100,20)};const r=compareCommunes(a,b);assert.equal(r.length,1);assert.equal(r[0].delta,10);assert.equal(r[0].code,'A');});
test('fusion de Commeny/Gouzangrez conserve les effectifs',()=>{const x=harmonize({'95169':unit(100,50),'95282':unit(50,40)});assert.deepEqual(Object.keys(x),['95169']);assert.equal(x['95169'].inscrits,150);assert.equal(x['95169'].pct_participation,60);});
test('contexte estimé : ratio des effectifs et valeurs manquantes explicites',()=>{const c={bureaux:{a:{P_POP:100,P_POP1524:50},b:{P_POP:900,P_POP1524:90}}};assert.equal(contextFor(c,['a','b','c']).youth,14);assert.equal(contextFor(c,['a','b','c']).covered,2);assert.equal(contextFor(c,['a']).graduates,null);});
test('aucun leader déduit de résultats incomplets ou de plusieurs scrutins',()=>{const u=unit(100,50,{quality:'complete',candidats:[{nom:'A',voix:50}]});assert.equal(canReadLeader(u),true);assert.equal(canReadLeader({...u,mixed_contests:true}),false);assert.equal(canReadLeader({...u,quality:'partial'}),false);assert.equal(canReadLeader({...u,quality:'multi_vote'}),false);});
test('CSV : noms et formules ne sont pas exécutables',()=>{assert.equal(csvCell('a"b'),'"a""b"');assert.equal(csvCell('=1+1'),'"\'=1+1"');});
test('tous les bureaux respectent les égalités et les agrégations communales',()=>{
  for(const file of readdirSync(new URL('../public/data/elections/',import.meta.url)).filter(f=>f.endsWith('-bv.json'))){
    const d=read('public/data/elections/'+file),b=Object.values(d.bureaux),communes=Object.values(read('public/data/elections/'+file.replace('-bv','')).communes);
    for(const u of b){assert.equal(u.inscrits,u.votants+u.abstentions,file);assert.equal(u.votants,u.exprimes+u.blancs+u.nuls,file);if(u.quality==='complete')assert.equal(u.candidats.reduce((s,c)=>s+c.voix,0),u.exprimes,file);}
    for(const k of ['inscrits','votants','exprimes','blancs','nuls','abstentions'])assert.equal(b.reduce((s,u)=>s+u[k],0),communes.reduce((s,u)=>s+u[k],0),file+' '+k);
  }
});
test('législatives 2024 : chaque candidat et total par circonscription égale la publication officielle',()=>{
 const official=read('tests/fixtures/legislatives-2024-official.json');
 for(const t of [1,2]){const actual=read(`public/data/elections/legislatives-2024-t${t}-circo.json`).circonscriptions;assert.deepEqual(Object.keys(actual).sort(),Object.keys(official[t]).sort());for(const [k,u] of Object.entries(actual)){for(const f of ['inscrits','votants','exprimes'])assert.equal(u[f],official[t][k][f],`${t} ${k} ${f}`);assert.deepEqual(Object.fromEntries(u.candidats.map(c=>[c.nom+'|'+c.prenom,c.voix])),official[t][k].candidats,`${t} ${k} candidats`);}}
 const t2=read('public/data/elections/legislatives-2024-t2-circo.json').circonscriptions;assert.equal(t2['08'],undefined);assert.equal(t2['05'],undefined);
 const c=read('public/data/elections/legislatives-2024-t2.json').communes;assert.equal(c['95585'].partial_scope,true);
});
test('présidentielles complètes et comparaison 2017/2022 sur 183 communes harmonisées',()=>{
 const a=read('public/data/elections/pres-2017-t2.json').communes,b=read('public/data/elections/pres-2022-t2.json').communes;
 assert.equal(compareCommunes(a,b).length,183);
 for(const y of [2017,2022]){const d=read(`public/data/elections/pres-${y}-t1-bv.json`).bureaux;assert.ok(Object.values(d).every(u=>u.quality==='complete'));}
});
test('couverture géographique et date municipale vérifiables',()=>{
 const q=read('public/data/quality.json').elections;assert.equal(q['legislatives-2024-t1'].unmapped.length,19);assert.equal(read('public/data/elections/municipales-2026-t2.json').date,'2026-03-22');assert.equal(read('public/data/geo/communes-95.geojson').features.length,183);
});
