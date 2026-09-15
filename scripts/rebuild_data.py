"""Rebuild the atlas from bureau-level records, with explicit coverage.

Usage: python scripts/rebuild_data.py --sources /path/to/downloads
Dependencies: shapely, pyarrow. Downloads are cached; checksums are published.
"""
import argparse
import csv
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen, urlretrieve

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
FIELDS = ['inscrits', 'votants', 'abstentions', 'exprimes', 'blancs', 'nuls']
URL = 'https://www.data.gouv.fr/api/1/datasets/'


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')


def pct(a, b):
    return round(a * 100 / b, 4) if b else 0


def normalize(u):
    u['pct_participation'] = pct(u['votants'], u['inscrits'])
    u['pct_abstention'] = pct(u['abstentions'], u['inscrits'])
    for c in u['candidats']:
        c['pct_exprimes'] = pct(c['voix'], u['exprimes'])
        c['pct_inscrits'] = pct(c['voix'], u['inscrits'])
    u['candidats'].sort(key=lambda c: (-c['voix'], c['nom'] or '', c['prenom'] or ''))
    u['tete'] = {k: u['candidats'][0].get(k) for k in ['nom', 'prenom', 'nuance', 'pct_exprimes']} if u['candidats'] else None
    u['quality'] = 'complete' if sum(c['voix'] for c in u['candidats']) == u['exprimes'] else 'partial'
    return u


def aggregate(records, name, candidate_scope=False):
    out = {k: sum(u[k] for u in records) for k in FIELDS}
    out.update(nom=name, bureaux_de_vote=len(records), candidats=[])
    cands = {}
    for u in records:
        for c in u['candidats']:
            # Local candidates cannot be conflated across electoral contests.
            key = (c['nom'], c.get('prenom'), c.get('nuance'), u.get('contest') if candidate_scope else None)
            if key not in cands:
                cands[key] = {k: c.get(k) for k in ['nom', 'prenom', 'nuance']}
                cands[key]['voix'] = 0
            cands[key]['voix'] += c['voix']
    out['candidats'] = list(cands.values())
    return normalize(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sources', type=Path, default=ROOT / '.cache/sources')
    args = parser.parse_args()
    args.sources.mkdir(parents=True, exist_ok=True)
    manifest = []

    def source(slug, filename, title=None):
        metadata = json.load(urlopen(URL + slug + '/'))
        resource = next(r for r in metadata['resources'] if r['title'] == title) if title else metadata['resources'][0]
        path = args.sources / filename
        if not path.exists():
            print('Download', filename, flush=True)
            urlretrieve(resource['url'], path)
        manifest.append({'file': filename, 'dataset': slug, 'resource': resource['id'], 'url': resource['url'], 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        return path

    # Full official presidential exports: one line per bureau, repeated candidate blocks.
    for year, tour, date in [(2022, 1, '2022-04-10'), (2017, 1, '2017-04-23'), (2017, 2, '2017-05-07')]:
        ordinal = '1er' if tour == 1 else '2nd'
        slug = (f'election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-{ordinal}-tour' if year == 2022 else f'election-presidentielle-des-23-avril-et-7-mai-2017-resultats-definitifs-du-{ordinal}-tour-par-bureaux-de-vote')
        title = 'resultats-par-niveau-burvot-t1-france-entiere.txt' if year == 2022 else None
        path = source(slug, f'pres{year}-t{tour}.txt', title)
        bureaux = {}
        with path.open(encoding='cp1252', newline='') as f:
            rows = csv.reader(f, delimiter=';')
            next(rows)
            for r in rows:
                if r[0] != '95':
                    continue
                code = '95' + r[4].zfill(3)
                key = code + '_' + r[6].zfill(4)
                assert key not in bureaux, ('duplicate bureau', key)
                u = dict(zip(FIELDS, [int(r[i]) for i in [7, 10, 8, 18, 12, 15]]))
                u.update(code_insee=code, nom_commune=r[5], nom=r[5]+' — bureau '+r[6], code_bv=r[6].zfill(4), code_circonscription=r[2].zfill(2), candidats=[])
                for i in range(21, len(r), 7):
                    if i + 6 < len(r) and r[i]:
                        u['candidats'].append({'nom': r[i+2], 'prenom': r[i+3], 'nuance': None, 'voix': int(r[i+4])})
                normalize(u)
                assert u['quality'] == 'complete', key
                bureaux[key] = u
        write(DATA/f'elections/pres-{year}-t{tour}-bv.json', {'election': f'Présidentielle {year}', 'tour': tour, 'date': date, 'status': 'reel', 'bureaux': bureaux})

    # Official circonscription candidate registers identify each legislative contest.
    official = {}
    candidate_circo = {}
    for tour in [1, 2]:
        slug = f'elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-{"1er" if tour == 1 else "2nd"}-tour'
        path = source(slug, f'leg2024-t{tour}-circo.csv', 'resultats-definitifs-par-circonscriptions-legislatives.csv' if tour==1 else 'resultats-definitifs-par-circonscription.csv')
        official[tour] = {}
        with path.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f, delimiter=';'):
                if row['Code département'] != '95':
                    continue
                circo = (row.get('Code circonscription législative') or row.get('Code circonscription'))[-2:]
                official[tour][circo] = {k: int(row['Exprimés' if k=='exprimes' else k.capitalize()]) for k in FIELDS}
                for i in range(1, 30):
                    nom = row.get(f'Nom candidat {i}')
                    if nom:
                        key = (nom, row[f'Prénom candidat {i}'])
                        if key in candidate_circo:
                            assert candidate_circo[key] == circo
                        candidate_circo[key] = circo

    files = {p.stem[:-3]: read(p) for p in sorted((DATA/'elections').glob('*-bv.json'))}
    pres_ref = files['pres-2022-t1']['bureaux']
    dep_ref = files['departementales-2021-t1']['bureaux']
    circo_by_bv = {k: b['code_circonscription'] for k,b in pres_ref.items()}
    for tour in [1,2]:
        for k,b in files[f'legislatives-2024-t{tour}']['bureaux'].items():
            codes = {candidate_circo[(c['nom'], c['prenom'])] for c in b['candidats'] if (c['nom'], c['prenom']) in candidate_circo}
            assert len(codes) == 1, ('ambiguous contest', k, codes)
            b['code_circonscription'] = codes.pop()
            circo_by_bv[k] = b['code_circonscription']
    canton_by_bv = {k: b['code_canton'] for k,b in dep_ref.items()}

    def unique_by_commune(ref):
        groups = defaultdict(set)
        for k,v in ref.items():
            groups[k[:5]].add(v)
        return {k: next(iter(v)) for k,v in groups.items() if len(v) == 1}

    pure_circo = unique_by_commune(circo_by_bv)
    pure_canton = unique_by_commune(canton_by_bv)
    pure_canton['95259'] = '21'  # Gadancourt : canton de Vauréal, INSEE / arrêté du 25/09/2017.
    geo = read(DATA/'geo/bureaux-vote-95.geojson')
    geokeys = {f['properties']['codeBureauVote'] for f in geo['features']}
    historic = DATA/'geo/communes-historique-95.geojson'
    if not historic.exists():
        write(historic, read(DATA/'geo/communes-95.geojson'))
    communes_geo = read(historic)
    names = {f['properties']['code']: f['properties']['nom'] for f in communes_geo['features']}
    canton_names = {f['properties']['code_canton']: f['properties']['nom'] for f in read(DATA/'geo/cantons-95.geojson')['features']}
    summary = {}
    for stem, data in files.items():
        bureaux = data['bureaux']
        local = stem.startswith(('municipales', 'legislatives', 'departementales'))
        for key,b in bureaux.items():
            b['nom'] = b.get('nom_commune', names.get(key[:5], key[:5])) + ' — bureau ' + key[6:]
            b['code_insee'] = key[:5]
            b['code_circonscription'] = b.get('code_circonscription') or circo_by_bv.get(key) or pure_circo.get(key[:5])
            b['code_canton'] = b.get('code_canton') or canton_by_bv.get(key) or pure_canton.get(key[:5])
            b['contest'] = key[:5] if stem.startswith('municipales') else b['code_canton'] if stem.startswith('departementales') else b['code_circonscription'] if local else 'national'
            normalize(b)
            if stem == 'municipales-2020-t1' and sum(c['voix'] for c in b['candidats']) > b['exprimes']:
                b['quality'] = 'multi_vote'
            assert b['inscrits'] == b['votants'] + b['abstentions'], (stem,key,'inscrits')
            assert b['votants'] == b['exprimes'] + b['blancs'] + b['nuls'], (stem,key,'votants')
        if stem == 'municipales-2026-t2':
            data['date'] = '2026-03-22'
        metadata = {k:data[k] for k in ['election','tour','date','status']}
        metadata['note'] = 'Résultats agrégés par bureau. Contours BV reconstitués : couverture géographique distincte de la couverture des résultats.'
        write(DATA/f'elections/{stem}-bv.json', {**metadata,'bureaux':bureaux})
        first = files.get(stem.replace('-t2','-t1'),data)['bureaux']
        groups_for_scale = {}
        for scale,field,suffix in [('communes','code_insee',''),('cantons','code_canton','-canton'),('circonscriptions','code_circonscription','-circo')]:
            groups = defaultdict(list)
            expected = defaultdict(int)
            for b in first.values():
                # Fallback here matters when the first-round file has not yet been normalized.
                code = b.get(field)
                if field=='code_insee' and code=='95259':
                    code='95040'
                if field == 'code_circonscription':
                    code = code or circo_by_bv.get(b['code_insee']+'_'+b['code_bv']) or pure_circo.get(b['code_insee'])
                if field == 'code_canton':
                    code = code or canton_by_bv.get(b['code_insee']+'_'+b['code_bv']) or pure_canton.get(b['code_insee'])
                if code:
                    expected[code] += 1
            for b in bureaux.values():
                if b.get(field):
                    groups['95040' if field=='code_insee' and b[field]=='95259' else b[field]].append(b)
            units = {}
            for code,rows in groups.items():
                name = names.get(code, rows[0].get('nom_commune',code)) if scale=='communes' else ('Canton de '+canton_names.get(code,code)) if scale=='cantons' else code+'ᵉ circonscription'
                u = aggregate(rows, name, local)
                u[field] = code
                if scale=='communes':
                    supplemental=read(DATA/'elus-municipaux.json').get(stem,{}).get(code)
                    if supplemental is not None:
                        u['elus_conseil_municipal']=supplemental
                    if stem.startswith('pres-2017') and code=='95040':
                        u['nom']='Avernes (avec Gadancourt)'
                        u['note_geographie']='Gadancourt regroupée avec Avernes, fusion du 01/01/2018.'
                u['nb_bureaux_attendus'] = expected.get(code,len(rows))
                u['partial_scope'] = len(rows) < u['nb_bureaux_attendus']
                u['mixed_contests'] = len({b['contest'] for b in rows}) > 1
                if any(b['quality']=='multi_vote' for b in rows):
                    u['quality'] = 'multi_vote'
                units[code] = u
            groups_for_scale[scale] = units
            write(DATA/f'elections/{stem}{suffix}.json', {**metadata,scale:units})
        if stem.startswith('legislatives-2024'):
            tour = data['tour']
            actual = groups_for_scale['circonscriptions']
            assert set(actual) == set(official[tour]), (stem,set(actual),set(official[tour]))
            for c,v in actual.items():
                for field in FIELDS:
                    assert v[field] == official[tour][c][field], (stem,c,field,v[field],official[tour][c][field])
        summary[stem] = {'bureaux':len(bureaux),'mapped':len(set(bureaux)&geokeys),'unmapped':sorted(set(bureaux)-geokeys),'communes':len(groups_for_scale['communes']), 'incomplete':sum(b['quality']=='partial' for b in bureaux.values()), 'unassigned_canton':sum(not b['code_canton'] for b in bureaux.values()), 'unassigned_circo':sum(not b['code_circonscription'] for b in bureaux.values())}

    from shapely.geometry import shape, mapping, box
    from shapely.ops import unary_union
    # Modern municipal geography; historical geometry remains selectable for old elections.
    merged = unary_union([shape(f['geometry']) for f in communes_geo['features'] if f['properties']['code'] in ['95169','95282']])
    modern = [f for f in communes_geo['features'] if f['properties']['code']!='95282']
    for f in modern:
        if f['properties']['code']=='95169':
            f['geometry']=mapping(merged)
    write(DATA/'geo/communes-95.geojson', {'type':'FeatureCollection','features':modern})
    territory=unary_union([shape(f['geometry']) for f in modern])
    write(DATA/'geo/departement-95.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','properties':{'nom':"Val-d'Oise"},'geometry':mapping(territory)}]})
    write(DATA/'geo/masque-95.geojson',{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':mapping(box(-15,35,15,60).difference(territory))}]})
    for field,prop,filename in [('code_circonscription','code_circonscription','circonscriptions'),('code_canton','code_canton','cantons')]:
        groups=defaultdict(list)
        for f in geo['features']:
            key=f['properties']['codeBureauVote']
            ref=circo_by_bv if field=='code_circonscription' else canton_by_bv
            pure=pure_circo if field=='code_circonscription' else pure_canton
            code=ref.get(key) or pure.get(key[:5])
            if code:
                groups[code].append(shape(f['geometry']))
        features=[{'type':'Feature','properties':{prop:k,'nom':canton_names.get(k,k) if filename=='cantons' else k+'ᵉ circonscription','method':'Union de contours BV reconstitués, non opposables'},'geometry':mapping(unary_union(v))} for k,v in groups.items()]
        write(DATA/f'geo/{filename}-95.geojson',{'type':'FeatureCollection','features':features})

    # Estimated context: no sensitive origin variables or composite ideological indices.
    import pyarrow.parquet as pq
    path=source('profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021','socio.parquet','bv-sociodemographique.parquet')
    cols=['P_POP','P_POP1524','P_POP6579','P_POP80P','P_NSCOL15P','P_NSCOL15P_SUP2','P_NSCOL15P_SUP34','P_NSCOL15P_SUP5']+[f'C_POP15P_CS{i}' for i in range(1,9)]
    rows=[r for r in pq.read_table(path).to_pylist() if r['code_commune'].startswith('95')]
    raw={r['id_brut_miom']:{k:r[k] if r[k] is not None and math.isfinite(r[k]) else None for k in cols} for r in rows}
    assert len(raw)==len(rows)
    write(DATA/'insee/context-95.json',{'status':'estimate','producer':'Projet André — interpolation de données INSEE RP 2022','source':'https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021','note':'Estimations spatiales, non observations INSEE au bureau. Les habitants ne sont pas les électeurs. Une association territoriale ne démontre pas une causalité ni un comportement individuel.','bureaux':raw})
    write(DATA/'quality.json',{'generated':'2026-09-15','elections':summary,'sources':manifest})
    print(json.dumps(summary,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
