# Provenance des données — Atlas électoral du Val-d'Oise

Ce document distingue précisément ce qui est **réel** (données officielles vérifiables) de ce qui est **structurel** (schéma prêt, sans données fabriquées). Aucune valeur de vote n'est inventée : là où une donnée réelle n'a pas pu être intégrée dans cette session, le fichier correspondant porte `"status": "a_completer"` et un tableau/objet vide, et l'interface affiche un badge « à compléter ».

## 1. Contours des communes — RÉEL

- Fichier : `public/data/geo/communes-95.geojson`
- Source : [france-geojson](https://github.com/gregoiredavid/france-geojson) (Étalab / IGN), `departements/95-val-d-oise/communes-95-val-d-oise.geojson`
- 184 communes du Val-d'Oise, géométries et codes INSEE réels.

## 2. Présidentielle 2022 (1er et 2nd tour) — RÉEL

- Fichiers : `public/data/elections/pres-2022-t1.json`, `pres-2022-t2.json` (niveau commune), `pres-2022-t1-circo.json`, `pres-2022-t2-circo.json` (niveau circonscription, agrégation réelle des communes), `pres-2022-t1-bv.json`, `pres-2022-t2-bv.json` (niveau bureau de vote).
- Source : [« Données des élections agrégées »](https://www.data.gouv.fr/datasets/donnees-des-elections-agregees) (data.gouv.fr), ressources `general_results` et `candidats_results`, produites à partir des résultats officiels du Ministère de l'Intérieur, agrégés au niveau du bureau de vote.
- Méthode : interrogation de la Tabular API de data.gouv.fr, filtrée sur `code_departement = 95` puis sur `id_election = 2022_pres_t1` / `2022_pres_t2`, avec dédoublonnage par identifiant de ligne (`__id`).
- Couverture vérifiée :
  - **2nd tour** : 184/184 communes, 811/811 bureaux de vote pour les résultats généraux (inscrits, abstention, participation) **et** pour le détail par candidat (Macron / Le Pen) — couverture à 100 %.
  - **1er tour** : 184/184 communes et 811/811 bureaux de vote pour les résultats généraux (inscrits, abstention, participation) — couverture à 100 %. Pour le détail voix par candidat au niveau bureau de vote, la couverture est d'environ 98 % (795 bureaux sur 811 disposent des 12 candidats complets ; quelques bureaux en bordure de page de pagination ont un ou deux candidats manquants). Les totaux communaux et départementaux, recoupés avec les résultats officiels connus (Mélenchon en tête au 1er tour dans le Val-d'Oise avec ~33 %, Macron ~66 % / Le Pen ~34 % au 2nd tour), sont cohérents avec les chiffres publiés.
- Circonscriptions : chaque commune porte son code de circonscription législative réel (`code_circonscription`), tel que publié dans les résultats du Ministère de l'Intérieur pour ce scrutin. Le contour `circonscriptions-95.geojson` est obtenu par **dissolution géométrique réelle** des 184 communes selon ce code (pas une approximation inventée : la géométrie est l'union exacte des communes qui composent chaque circonscription, et les 10 circonscriptions produites correspondent bien aux 10 circonscriptions législatives du Val-d'Oise).

## 3. Législatives 2024, Européennes 2024, Municipales 2020 — À COMPLÉTER

- Fichiers : `public/data/elections/legislatives-2024-t1.json`, `legislatives-2024-t2.json`, `europeennes-2024.json`, `municipales-2020-t1.json`.
- Le même jeu de données agrégé (« Données des élections agrégées ») contient bien ces scrutins (`id_election` = `2024_legi_t1`, `2024_legi_t2`, `2024_euro_t1`, `2020_muni_t1`/`t2`), avec la même méthode d'extraction. Faute de temps dans cette session (priorité donnée à la Présidentielle 2022, complète sur les deux tours), ces fichiers ne contiennent aucun résultat : `"status": "a_completer"`, `"communes": {}`. L'interface affiche un badge « à compléter » plutôt que d'inventer des chiffres.
- Pour les compléter, voir la procédure décrite dans le README (section « Actualisation des données »).

## 4. Bureau de vote — contours géographiques — À COMPLÉTER (contrainte d'accès réseau)

- Un jeu de données réel et pertinent a été identifié en cours de session : [« Proposition de contours des bureaux de vote »](https://www.data.gouv.fr/datasets/proposition-de-contours-des-bureaux-de-vote) (INSEE / Etalab, méthode des polygones de Voronoï à partir du Répertoire électoral unique), hébergé sur `object.files.data.gouv.fr` (fichier France entière, ~645 Mo en GeoJSON ou ~270 Mo en PMTiles).
- **Ce fichier n'a pas pu être téléchargé dans cette session** : l'environnement d'exécution restreint les accès réseau sortants à une liste d'hôtes autorisés (GitHub, npm, PyPI, etc.) via un proxy de sortie ; les domaines `data.gouv.fr`, `static.data.gouv.fr` et `object.files.data.gouv.fr` sont explicitement bloqués par la politique réseau de cette session (erreurs `connect_rejected` confirmées à plusieurs reprises, y compris via l'outil de récupération web dédié). Le dépôt de génération [`etalab/bureau-vote`](https://github.com/etalab/bureau-vote) a été inspecté : il contient le code de génération mais aucun extrait départemental pré-calculé exploitable sans télécharger le fichier France entière.
- En conséquence, l'échelle « bureau de vote » est fonctionnelle dans l'interface (sélecteur, fiche, résultats réels listés — voir section 2) mais **sans couche cartographique** : un message explicite « couche à venir (nécessite géocodage IGN/BAN) » s'affiche sur la carte plutôt que des contours approximatifs ou inventés.
- Prochaine étape recommandée : relancer l'intégration depuis un environnement disposant d'un accès réseau complet vers `data.gouv.fr`, filtrer le GeoJSON France entière sur le département 95 (par exemple en streaming avec `ijson` ou via `ogr2ogr -where "dep='95'"`), puis publier `public/data/geo/bureaux-vote-95.geojson`.

## 5. Canton — À COMPLÉTER

- Aucune table de correspondance commune ↔ canton à jour et fiable n'a pu être récupérée dans le temps imparti (les tables disponibles sur data.gouv.fr sont antérieures au dernier redécoupage cantonal ou ne sont pas exploitables via l'API tabulaire accessible depuis cette session). Plutôt que de produire un canton approximatif non vérifiable, l'échelle « canton » reste **structurelle uniquement** : sélecteur fonctionnel, message « à compléter » explicite, aucun contour ni résultat affiché.

## 6. Profil sociodémographique (âge, CSP) — À COMPLÉTER (contrainte d'accès réseau)

- Un jeu de données réel a été identifié : [« Profil sociodémographique des bureaux de vote — France métropolitaine (INSEE RP 2022 & Filosofi 2021) »](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021) (structure par âge, CSP, diplômes, revenus, par bureau de vote — exactement ce qu'il fallait pour le croisement demandé).
- Ce jeu de données est distribué uniquement en **Parquet** (non interrogeable via l'API tabulaire disponible dans cette session) et hébergé sur `static.data.gouv.fr`, domaine bloqué par la politique réseau de cette session (voir section 4).
- `public/data/insee/insee-95-communes.json` documente le schéma attendu (`age`, `csp`) pour une intégration ultérieure ; l'interface affiche un badge « à compléter » partout où ce croisement serait utilisé (panneau latéral, fiche par unité) plutôt que d'inventer des pourcentages.

## Résumé

| Donnée | Statut | Source |
|---|---|---|
| Contours communes (95) | Réel | france-geojson (Étalab/IGN) |
| Présidentielle 2022 T1/T2 — commune | Réel (184/184 communes) | data.gouv.fr — Données des élections agrégées |
| Présidentielle 2022 T1/T2 — bureau de vote | Réel (100 % T2, ~98 % T1 pour le détail candidat) | idem |
| Présidentielle 2022 T1/T2 — circonscription | Réel (agrégation + dissolution géométrique réelle) | idem |
| Législatives 2024, Européennes 2024, Municipales 2020 | À compléter (structure prête) | idem (non intégré, faute de temps) |
| Contours bureaux de vote | À compléter (accès réseau bloqué) | INSEE/Etalab — proposition de contours BV |
| Contours et résultats cantons | À compléter (table de correspondance non trouvée) | — |
| Profil sociodémographique (âge, CSP) | À compléter (accès réseau bloqué, format Parquet) | INSEE RP 2022 / Filosofi 2021 |
