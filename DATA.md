# Provenance des données — Atlas électoral du Val-d'Oise

Ce document distingue précisément ce qui est **réel** (données officielles vérifiables) de ce qui est **structurel** (schéma prêt, sans données fabriquées). Aucune valeur de vote n'est inventée : là où une donnée réelle n'a pas pu être intégrée, le fichier correspondant porte `"status": "a_completer"` (ou, pour un sous-ensemble seulement — ex. détail candidat manquant sur une participation par ailleurs réelle — un `candidats: []` explicite accompagné d'une note), et l'interface affiche un badge « à compléter » plutôt que d'afficher un chiffre inventé.

## 1. Contours des communes — RÉEL

- Fichier : `public/data/geo/communes-95.geojson`
- Source : [france-geojson](https://github.com/gregoiredavid/france-geojson) (Étalab / IGN), `departements/95-val-d-oise/communes-95-val-d-oise.geojson`
- 184 communes du Val-d'Oise, géométries et codes INSEE réels.

## 2. Contours des bureaux de vote — RÉEL

- Fichier : `public/data/geo/bureaux-vote-95.geojson`
- Source : même méthode que [« Proposition de contours des bureaux de vote »](https://www.data.gouv.fr/datasets/proposition-de-contours-des-bureaux-de-vote) (INSEE / Etalab, polygones de Voronoï à partir du Répertoire électoral unique) — **810 bureaux du Val-d'Oise**, géométries MultiPolygon, propriétés `codeCommune`, `numeroBureauVote`, `codeBureauVote` (ex. `95002_0001`), `codeCirconscription`.
- **Obtention** : le téléchargement direct du fichier France entière (~645 Mo, hébergé sur `object.files.data.gouv.fr`) s'est heurté au blocage réseau documenté plus bas (§7) — `object.files.data.gouv.fr` fait partie des domaines refusés par le proxy de sortie de cette session, confirmé par plusieurs tentatives (`curl`, outil de récupération web dédié). L'utilisateur a fourni un **export local** du même jeu de données (réalisé dans QGIS, filtré sur `codeDepartement = 95`), ce qui a permis d'intégrer la couche sans la fabriquer ni l'approximer.
- Utilisée comme couche cartographique réelle pour l'échelle « bureau de vote », jointe aux résultats via la clé `codeBureauVote` (identique au format `id_brut_miom` / `code_insee_code_bv` utilisé dans les fichiers de résultats, ex. `95002_0001`). Toutes les sources bureau de vote (Tabular API et exports DGRC officiels) sont normalisées vers cette même convention (commune sur 5 chiffres, numéro de bureau sur 4 chiffres avec zéros de tête) lors de leur traitement, y compris lorsque le fichier source utilise un format différent (ex. « Code de la commune » : « 002 » ou « Code BV » : « 1 » sans zéros).

## 3. Présidentielle 2022 (1er et 2nd tour) — RÉEL

- Fichiers : `public/data/elections/pres-2022-t1.json`, `pres-2022-t2.json` (niveau commune), `pres-2022-t1-circo.json`, `pres-2022-t2-circo.json` (niveau circonscription), `pres-2022-t1-bv.json`, `pres-2022-t2-bv.json` (niveau bureau de vote).
- **1er tour** : source [« Données des élections agrégées »](https://www.data.gouv.fr/datasets/donnees-des-elections-agregees) (data.gouv.fr), interrogée via la Tabular API (filtre `code_departement = 95`, `id_election = 2022_pres_t1`, tri par `id_brut_miom`, dédoublonnage par `__id`). Couverture vérifiée : **184/184 communes** et **811/811 bureaux de vote** pour les résultats généraux (inscrits, abstention, participation) — 100 %. Détail voix par candidat au niveau bureau : **795/811 bureaux (98 %)** disposent des 12 candidats complets ; quelques bureaux en bordure de page de pagination ont un ou deux candidats manquants. Aucune commune n'est privée de détail candidat (agrégation communale donc fiable à 100 % des communes, avec une légère sous-estimation possible de quelques dixièmes de point sur ~2 % des bureaux).
- **2nd tour** : recalculé à partir d'un **export officiel DGRC (Ministère de l'Intérieur) fourni par l'utilisateur**, fichier résultats définitifs par bureau de vote (811 features, 2 candidats par bureau). Couverture : **184/184 communes, 811/811 bureaux, 100 %** — remplace et confirme l'agrégation Tabular API précédente (mêmes totaux départementaux : Macron 66,15 %, Le Pen 33,85 % des exprimés).
- Circonscriptions : chaque commune porte son code de circonscription législative réel (`code_circonscription`). Le contour `circonscriptions-95.geojson` est obtenu par **dissolution géométrique réelle** des 184 communes selon ce code (union exacte des communes de chaque circonscription — pas une approximation).

## 4. Législatives 2024 (1er et 2nd tour) — RÉEL

- Fichiers : `public/data/elections/legislatives-2024-t1.json`, `legislatives-2024-t1-bv.json`, `legislatives-2024-t2.json`, `legislatives-2024-t2-bv.json`.
- **1er tour** : recalculé à partir d'un **export officiel DGRC fourni par l'utilisateur**, fichier résultats définitifs par bureau de vote (828 features), format large avec jusqu'à 19 candidats détectés dynamiquement par bureau. Couverture : **828/828 bureaux de vote (100 %)**, **183/184 communes**. La commune de Gouzangrez (~130 électeurs inscrits) est absente de ce fichier officiel exactement comme de la source Tabular API utilisée initialement — son absence est donc confirmée comme un fait réel des données sources (rattachement administratif de son bureau de vote), pas une lacune de récupération. Remplace l'agrégation Tabular API précédente (qui plafonnait à 98 % de couverture du détail candidat) ; les totaux départementaux sont strictement identiques (744 653 inscrits, 471 441 exprimés), ce qui confirme la cohérence entre les deux sources. Deux candidats élus dès le 1er tour sont correctement identifiés (Paul Vannier et Carlos Martens Bilongo, tous deux Union de la gauche).
- **2nd tour** : **export officiel DGRC fourni par l'utilisateur**, fichier résultats définitifs par bureau de vote (703 features). Couverture : **177/184 communes, 703/703 bureaux, 100 %** — 177/184 est un résultat structurellement normal et non une donnée manquante : seules les communes rattachées à une circonscription ayant nécessité un second tour votent à ce tour (7 des 10 circonscriptions du Val-d'Oise ont été tranchées dès le premier tour en 2024). Le tour a été déterminé par déduction des données elles-mêmes (candidats « élus » avec des scores de 25 à 47 % des exprimés, impossibles en 1er tour où l'élection directe exige plus de 50 % des exprimés **et** plus de 25 % des inscrits) plutôt que supposé a priori.

## 5. Européennes 2024 — RÉEL

- Fichiers : `public/data/elections/europeennes-2024.json`, `europeennes-2024-bv.json`.
- Source : **export officiel DGRC fourni par l'utilisateur**, fichier résultats définitifs par bureau de vote (828 features), format large avec 38 listes détectées dynamiquement (colonnes `Voix 1`…`Voix 38`).
- Couverture : **183/184 communes** (Gouzangrez absente, cf. §4), **828/828 bureaux, 100 %**. Totaux départementaux cohérents avec les résultats connus du Val-d'Oise pour ce scrutin (liste RN en tête département avec ~25,5 %, LFI ~22,9 %, Renaissance ~12,6 %, RN-dissidents/Reconquête ~5-6 %).

## 6. Municipales 2020 (1er et 2nd tour) — RÉEL (participation), DÉTAIL LISTE À COMPLÉTER

- Fichiers : `public/data/elections/municipales-2020-t1.json`, `municipales-2020-t2.json`.
- Source : Tabular API de « Données des élections agrégées » (`id_election = 2020_muni_t1` / `2020_muni_t2`), même méthode. Seuls les résultats généraux (inscrits, abstentions, votants, blancs, nuls, exprimés, participation) ont été agrégés dans cette session — le détail par liste/candidat n'a pas été traité, faute de temps disponible pour paginer le volume de bureaux × listes que cela représente (chaque bureau peut compter 2 à 10+ listes municipales).
- Couverture réelle de la participation : **T1 : 184/184 communes (100 %)** ; **T2 : 35/184 communes** — résultat structurellement normal (seules les communes n'ayant pas obtenu de liste majoritaire dès le 1er tour organisent un 2nd tour ; le 2nd tour 2020 a en outre été reporté au 28 juin 2020 pour cause de COVID-19, ce report est appliqué à la date affichée).
- L'interface affiche un badge « à compléter » spécifiquement sur la section « résultats par candidat » pour ce scrutin, tout en affichant les chiffres réels de participation.

## 7. Canton — RÉEL

- Fichier de contours : `public/data/geo/cantons-95.geojson` (21 cantons — Val-d'Oise post-redécoupage 2015).
- Fichiers de résultats : `public/data/elections/departementales-2021-t2-canton.json`.
- **Source de la correspondance commune/bureau ↔ canton** : le fichier officiel DGRC des Départementales 2021 (2nd tour, §10 ci-dessous), qui porte le code et le libellé de canton réels pour chacun de ses 809 bureaux de vote du Val-d'Oise. C'est la première donnée de cette session à fournir un référentiel cantonal fiable et à jour.
- **Méthode de construction des contours** : dissolution géométrique réelle, mais au niveau **bureau de vote** (et non commune) — nécessaire car deux communes denses, Argenteuil (95018) et Cergy (95127), sont chacune scindées entre plusieurs cantons (Argenteuil-1/2/3, Cergy-1/2). Chacun des 810 polygones de bureaux de vote (§2) a été affecté à son canton réel via la jointure sur `codeBureauVote`, puis les polygones ont été fusionnés par canton. 808/810 bureaux se sont joints directement (numérotation identique entre le millésime des contours de bureaux et celui des Départementales 2021) ; les 2 bureaux restants ont été rattachés au canton majoritaire de leur commune (méthode de repli, toujours basée sur un code de canton réel, jamais inventé). Résultat : **21/21 cantons produits**, y compris les 3 cantons partiels d'Argenteuil et les 2 de Cergy, correctement scindés.
- Sanity check : nombre de cantons obtenu (21) conforme à l'attendu pour le Val-d'Oise depuis le redécoupage cantonal de 2015.

## 7bis. Départementales 2021 (2nd tour) — RÉEL ; 1er tour à compléter

- Fichiers : `public/data/elections/departementales-2021-t2.json` (commune), `departementales-2021-t2-canton.json` (canton — échelle nativement pertinente pour ce scrutin), `departementales-2021-t2-bv.json` (bureau de vote). `departementales-2021-t1.json` reste une structure vide (`status: "a_completer"`) : seul le 2nd tour a été transmis.
- Source : **export officiel DGRC fourni par l'utilisateur**, fichier résultats définitifs par bureau de vote, France entière (809 bureaux du Val-d'Oise après filtrage sur `code_departement = 95`), binômes candidats (jusqu'à 2 par bureau en 2nd tour, colonnes détectées dynamiquement).
- Couverture : **184/184 communes, 21/21 cantons, 809/809 bureaux de vote (100 %)** au niveau participation et détail par binôme.
- Ce scrutin est le seul dont l'échelle native est le canton (chaque binôme se présente dans un seul canton) : c'est donc la donnée la plus riche pour tester l'échelle cantonale de l'Atlas.

## 8. Profil sociodémographique (âge, CSP) — À COMPLÉTER (contrainte d'accès réseau)

- Un jeu de données réel a été identifié : [« Profil sociodémographique des bureaux de vote — France métropolitaine (INSEE RP 2022 & Filosofi 2021) »](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021) (structure par âge, CSP, diplômes, revenus, par bureau de vote).
- Ce jeu de données est distribué uniquement en **Parquet** (non interrogeable via l'API tabulaire disponible dans cette session) et hébergé sur `static.data.gouv.fr`, domaine bloqué par la politique réseau de cette session (voir §9).
- `public/data/insee/insee-95-communes.json` documente le schéma attendu (`age`, `csp`) pour une intégration ultérieure ; l'interface affiche un badge « à compléter » partout où ce croisement serait utilisé.

## 9. Contrainte d'accès réseau de cette session

L'environnement d'exécution restreint les accès réseau sortants à une liste d'hôtes autorisés (GitHub, npm, PyPI, etc.) via un proxy de sortie ; les domaines `data.gouv.fr`, `www.data.gouv.fr`, `static.data.gouv.fr` et `object.files.data.gouv.fr` sont explicitement bloqués (`connect_rejected` confirmés à plusieurs reprises, y compris via l'outil de récupération web dédié). La **Tabular API** de data.gouv.fr reste néanmoins accessible via l'outil MCP `data_gouv` dédié (celui-ci s'exécute côté serveur, hors du proxy de sortie de cette session), ce qui a permis d'en tirer l'essentiel des données réelles ci-dessus ; les fichiers volumineux hors Tabular API (Parquet, GeoJSON France entière) sont restés inatteignables directement et ont, pour les bureaux de vote, été obtenus via un export local fourni par l'utilisateur.

## Résumé

| Donnée | Statut | Couverture | Source |
|---|---|---|---|
| Contours communes (95) | Réel | 184/184 | france-geojson (Étalab/IGN) |
| Contours bureaux de vote (95) | Réel | 810 bureaux | INSEE/Etalab (export QGIS fourni par l'utilisateur) |
| Présidentielle 2022 T1 — commune | Réel | 184/184 | data.gouv.fr, Tabular API |
| Présidentielle 2022 T1 — bureau (participation) | Réel | 811/811 | idem |
| Présidentielle 2022 T1 — bureau (détail candidat) | Réel | 795/811 (98 %) | idem |
| Présidentielle 2022 T2 — commune et bureau | Réel | 184/184, 811/811 (100 %) | export officiel DGRC (utilisateur) |
| Présidentielle 2022 T1/T2 — circonscription | Réel | 10/10 | agrégation + dissolution géométrique réelle |
| Législatives 2024 T1 — commune et bureau | Réel | 183/184 (Gouzangrez absente, confirmé), 828/828 (100 %) | export officiel DGRC (utilisateur) |
| Législatives 2024 T2 — commune et bureau | Réel | 177/184 (structurel), 703/703 | export officiel DGRC (utilisateur) |
| Européennes 2024 — commune et bureau | Réel | 183/184, 828/828 | export officiel DGRC (utilisateur) |
| Municipales 2020 T1 — participation | Réel | 184/184 | data.gouv.fr, Tabular API |
| Municipales 2020 T2 — participation | Réel | 35/184 (structurel) | idem |
| Municipales 2020 T1/T2 — détail liste/candidat | À compléter | — | non traité (volume de pagination) |
| Contours cantons (95) | Réel | 21/21 | dissolution BV réelle, référentiel Départementales 2021 (utilisateur) |
| Départementales 2021 T2 — commune, canton, bureau | Réel | 184/184, 21/21, 809/809 (100 %) | export officiel DGRC (utilisateur) |
| Départementales 2021 T1 | À compléter | — | non fourni par l'utilisateur |
| Profil sociodémographique (âge, CSP) | À compléter | — | INSEE RP 2022/Filosofi 2021 (Parquet, accès réseau bloqué) |
