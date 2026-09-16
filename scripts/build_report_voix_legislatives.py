#!/usr/bin/env python3
"""Mesure le report de voix réel entre les deux tours des législatives 2024 dans le
Val-d'Oise, dans les circonscriptions où le RN a été battu en duel par l'union de la
gauche (candidat unique face au RN au second tour, sans candidat Centre/Droite restant).

Méthode, par circonscription en duel UG/RN :
  autres_T1 = exprimés_T1 - voix_UG_T1 - voix_RN_T1   (électorat Centre/Droite/EXG du 1er tour,
              éliminé ou retiré avant le 2nd tour)
  report_gauche = (voix_UG_T2 - voix_UG_T1) / autres_T1
  report_rn     = (voix_RN_T2 - voix_RN_T1) / autres_T1
  (le résidu — ni gauche ni RN — correspond à l'abstention/blancs supplémentaires du 2nd tour)

Chaque taux est ensuite agrégé sur l'ensemble des duels, pondéré par la taille du réservoir
« autres_T1 » de chaque circonscription (pas une simple moyenne de pourcentages).

Champ d'application : seulement les DUELS stricts (2 candidats au 2nd tour, un RN et un
candidat de gauche). Les triangulaires (où un candidat Centre/Droite s'est maintenu, ex.
circonscriptions 01 et 06 du Val-d'Oise en 2024) sont exclues du calcul du taux — elles sont
listées à part car leur dynamique de report est différente (pas de retrait, la voix
Centre/Droite reste sur son propre candidat) — mais restent un signal utile : même sans aucun
report specifique, l'union de la gauche y aurait dépassé le RN dans un des deux cas (01), pas
dans l'autre.

Ne couvre que le Val-d'Oise (95) — aucune extrapolation nationale : la comparaison nationale
demanderait de moissonner les résultats candidat par candidat des 577 circonscriptions
françaises (non fait ici, faute de source déjà chargée dans ce dépôt).

Usage : python3 scripts/build_report_voix_legislatives.py
Écrit public/data/elections/report-voix-legislatives-2024.json.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data" / "elections"
OUT = DATA / "report-voix-legislatives-2024.json"

GAUCHE_NUANCES = {"UG", "UGE", "SOC", "RDG", "DVG", "COM", "FI", "ECO", "LUG"}
RN_NUANCES = {"RN"}


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def main():
    t1 = load("legislatives-2024-t1-circo.json")["circonscriptions"]
    t2 = load("legislatives-2024-t2-circo.json")["circonscriptions"]

    duels, triangulaires = [], []
    for code, c1 in t1.items():
        c2 = t2.get(code)
        if not c2:
            continue
        cands2 = c2["candidats"]
        rn2 = next((c for c in cands2 if (c.get("nuance") or "").upper() in RN_NUANCES), None)
        gauche2 = next((c for c in cands2 if (c.get("nuance") or "").upper() in GAUCHE_NUANCES), None)
        if not rn2 or not gauche2:
            continue  # RN battu dès le 1er tour ou absent du 2nd tour : hors périmètre

        rn1 = next((c for c in c1["candidats"] if (c.get("nuance") or "").upper() in RN_NUANCES), None)
        gauche1 = next((c for c in c1["candidats"] if (c.get("nuance") or "").upper() in GAUCHE_NUANCES), None)
        if not rn1 or not gauche1:
            continue

        autres_t1 = c1["exprimes"] - gauche1["voix"] - rn1["voix"]
        entry = {
            "circonscription": code,
            "nom": c1["nom"],
            "gauche_t1": gauche1["voix"],
            "gauche_t2": gauche2["voix"],
            "rn_t1": rn1["voix"],
            "rn_t2": rn2["voix"],
            "autres_t1": autres_t1,
            "report_gauche": round((gauche2["voix"] - gauche1["voix"]) / autres_t1, 4) if autres_t1 else None,
            "report_rn": round((rn2["voix"] - rn1["voix"]) / autres_t1, 4) if autres_t1 else None,
            "nb_candidats_t2": len(cands2),
        }
        if len(cands2) == 2:
            duels.append(entry)
        else:
            triangulaires.append(entry)

    total_autres = sum(d["autres_t1"] for d in duels)
    total_delta_gauche = sum(d["gauche_t2"] - d["gauche_t1"] for d in duels)
    total_delta_rn = sum(d["rn_t2"] - d["rn_t1"] for d in duels)
    report_gauche_agg = round(total_delta_gauche / total_autres, 4) if total_autres else None
    report_rn_agg = round(total_delta_rn / total_autres, 4) if total_autres else None

    out = {
        "source": {
            "jeu": "Législatives 2024, 1er et 2nd tours, Val-d'Oise — Ministère de l'Intérieur (DGRC), déjà chargé dans ce dépôt",
            "fichiers": ["legislatives-2024-t1-circo.json", "legislatives-2024-t2-circo.json"],
            "perimetre": "Val-d'Oise uniquement (8 circonscriptions) ; aucune donnée nationale agrégée ici.",
            "methode": "Report mesuré = (voix T2 - voix T1) / (exprimés T1 - voix gauche T1 - voix RN T1), sur les seuls duels stricts (2 candidats au 2nd tour). Agrégation pondérée par la taille du réservoir de voix « autres » de chaque circonscription, pas une moyenne simple de pourcentages.",
        },
        "duels": duels,
        "triangulaires": triangulaires,
        "aggregate": {
            "nb_duels": len(duels),
            "total_autres_t1": total_autres,
            "report_gauche": report_gauche_agg,
            "report_rn": report_rn_agg,
            "report_residuel": round(1 - (report_gauche_agg or 0) - (report_rn_agg or 0), 4) if report_gauche_agg is not None else None,
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(duels)} duels UG/RN, {len(triangulaires)} triangulaires. Report gauche={report_gauche_agg}, report RN={report_rn_agg}")


if __name__ == "__main__":
    main()
