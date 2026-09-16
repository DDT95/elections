#!/usr/bin/env python3
"""Extrait revenu médian, taux de pauvreté et CSP (Insee Filosofi/RP 2023) depuis le
dépôt DDT95/VO-Insee (data/processed/commune_profiles.json et departement_profile.json),
qui les calcule déjà à partir de la Base du dossier complet Insee — aucune donnée
recalculée ou inventée ici, simple extraction/renommage des champs utiles à l'Atlas
électoral. Ne couvre pas le taux de chômage : ce champ n'est pas présent dans les
fichiers traités de VO-Insee au moment de l'écriture (secret statistique ou non encore
enrichi selon les communes) ; il n'est donc pas affiché plutôt qu'estimé.

Usage : python3 scripts/build_contexte_socio_eco.py
Écrit public/data/insee/contexte-socio-eco.json.
"""
import json
import urllib.request
from pathlib import Path

RAW_BASE = "https://raw.githubusercontent.com/DDT95/VO-Insee/main/data/processed"
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "insee" / "contexte-socio-eco.json"


def fetch_json(name: str):
    with urllib.request.urlopen(f"{RAW_BASE}/{name}") as resp:
        return json.load(resp)


def extract_habitants(profile: dict) -> dict:
    h = profile.get("themes", {}).get("habitants", {})
    rp = h.get("revenus_pauvrete", {})
    csp = h.get("categorie_socioprofessionnelle", {})
    return {
        "niveau_vie_median": rp.get("niveau_vie_median"),
        "taux_pauvrete": rp.get("taux_pauvrete"),
        "csp": {
            "note": csp.get("note"),
            "annee": csp.get("annee"),
            "quality_flag": csp.get("quality_flag"),
            "repartition": csp.get("repartition"),
        },
    }


def main():
    communes = fetch_json("commune_profiles.json")
    departement = fetch_json("departement_profile.json")

    out = {
        "source": {
            "depot": "https://github.com/DDT95/VO-Insee",
            "site": "https://ddt95.github.io/VO-Insee/",
            "jeu": "Insee — Base du dossier complet (RP2023) et Filosofi 2023, via DDT95/VO-Insee",
            "note": "Filosofi masque les communes de moins de 50 ménages fiscaux (secret statistique) : niveau_vie_median/taux_pauvrete valent alors null, jamais zéro. Le taux de chômage n'est pas disponible dans VO-Insee au moment de cette extraction.",
        },
        "departement": extract_habitants(departement),
        "communes": {code: extract_habitants(p) for code, p in communes.items()},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    missing = sum(1 for c in out["communes"].values() if c["niveau_vie_median"] is None or c["niveau_vie_median"].get("value") is None)
    print(f"{len(out['communes'])} communes écrites dans {OUT} ({missing} sans niveau de vie médian, secret statistique)")


if __name__ == "__main__":
    main()
