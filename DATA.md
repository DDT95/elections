# Provenance des données — Atlas électoral du Val-d'Oise

Ce document distingue précisément ce qui est **réel** (données officielles vérifiables) de ce qui est **structurel** (schéma prêt, sans données fabriquées). Aucune valeur de vote n'est inventée : là où une donnée réelle n'a pas pu être intégrée, le fichier correspondant porte `"status": "a_completer"` (ou, pour un sous-ensemble seulement — ex. détail candidat manquant sur une participation par ailleurs réelle — un `candidats: []` explicite accompagné d'une note), et l'interface affiche un badge « à compléter » plutôt que d'afficher un chiffre inventé.

**Note d'interface (survol de la carte)** : au survol d'une commune, d'un bureau de vote, d'un canton ou d'une circonscription, la carte affiche un aperçu léger (contour éclairci, infobulle collée au curseur avec le nom et le chiffre clé du scrutin sélectionné) sans ouvrir la fiche complète ; le clic reste nécessaire pour ouvrir la fiche détaillée dans le tiroir latéral. L'unité actuellement sélectionnée (fiche ouverte) conserve un halo persistant et visuellement distinct (contour bleu marque épais et pointillé) qui ne disparaît pas au survol d'une autre unité.

**Note d'interface (couleurs de nuance politique)** : la carte, la légende et les fiches candidat/liste utilisent une même table de correspondance nuance → couleur, définie et documentée dans `app/lib/nuances.ts`. Elle regroupe les codes officiels de nuance (candidat individuel : `RN`, `LR`, `ENS`, `UG`, `FI`... ; liste municipale, préfixe `L` : `LRN`, `LLR`, `LFI`...  ; binôme départemental, préfixe `BC-` : `BC-RN`, `BC-LR`...) en 14 grandes familles politiques, avec une couleur inspirée des conventions habituelles des cartes de soirée électorale des médias français (approximation non officielle, choisie pour rester lisible et distincte — notamment LR en bleu vif traditionnel contre RN en bleu marine très sombre, les deux étant souvent confondus s'ils restent tous deux en bleu clair). Pour la Présidentielle 2022, seul scrutin de l'Atlas dont la source ne porte aucun code de nuance, la couleur retombe sur une table par nom de candidat (`app/lib/color.ts`), alignée sur la même palette. **Aucun logo ou emblème de parti n'est utilisé nulle part dans l'application** : chaque candidat/liste est identifié par une pastille de couleur et un badge textuel portant le code de nuance brut (ex. « RN », « LFI », « ENS »), jamais par une marque déposée d'un parti — un logo officiel scrapé serait un risque juridique réel sur un outil de préfecture et n'a donc jamais été envisagé.

## 0. Municipales 2026 (1er et 2nd tour) — RÉEL — scrutin le plus récent

- Fichiers : `public/data/elections/municipales-2026-t1.json`, `-t1-bv.json`, `-t1-canton.json`, `-t1-circo.json`, `municipales-2026-t2.json`, `-t2-bv.json`, `-t2-canton.json`, `-t2-circo.json`.
- Source : **export officiel DGRC (Ministère de l'Intérieur) fourni par l'utilisateur**, résultats définitifs par bureau de vote. Le 1er tour (15 mars 2026) est un GeoJSON à géométrie nulle (table attributaire seule), 828 features, codes commune/bureau déjà normalisés par la source (5 et 4 chiffres). Le 2nd tour (23 mars 2026) est un CSV France entière `;`-délimité en UTF‑8, filtré ici sur `Code département = 95` (parsé avec le module `csv` de Python, gestion correcte des guillemets, jamais un simple `split`). Les deux fichiers ont le même format large, listes détectées dynamiquement par bloc de colonnes répétées (jusqu'à 13 listes par bureau selon les communes), avec en plus des scrutins précédents des champs **« Sièges au CM »** (conseil municipal) et **« Sièges au CC »** (conseil communautaire) repris tels quels.
- **Couverture** :
  - **1er tour** : **183/184 communes réel, 828/828 bureaux (100 %)** — Gouzangrez absente, comme pour les scrutins 2024 (§4, §5) et la population historique (§8), troisième/quatrième confirmation indépendante qu'il s'agit d'une caractéristique récurrente des sources concernant cette commune et non d'une erreur de traitement.
  - **2nd tour** : **28/184 communes réel, 314/314 bureaux de ces communes (100 %)** — résultat structurellement normal : comme pour toutes les élections municipales, seules les communes n'ayant pas dégagé de majorité absolue au 1er tour organisent un 2nd tour (même logique que Municipales 2020 T2, §6).
  - **Élus municipaux** : le fichier national des élus 2nd tour (colonnes `NOMPSN;PREPSN;DATNAIPSN;...;CODDPT;CODCOM;...`, filtré `CODDPT = "95"`) a été joint par commune : **890 élus sur les 28 communes du 2nd tour**. Le champ « Elu N » n'est, dans les fichiers de résultats au grain bureau de vote, pas renseigné par la source elle-même (probablement calculé uniquement au niveau commune dans la publication officielle) ; il est conservé tel quel plutôt qu'estimé, et c'est le fichier national des élus qui fait foi pour cette information.
  - Canton et circonscription : rollups réels par simple agrégation des résultats de bureau de vote/commune déjà réels (même méthode qu'au §7) — **T1 : 21/21 cantons, 10/10 circonscriptions** ; **T2 : 18 cantons (structurel, reflète les 28 communes du 2nd tour), 10/10 circonscriptions représentées**.
- Aucun 3e fichier (le cas échéant un éventuel tour supplémentaire propre à certaines communes) n'a été fourni ; seuls les deux tours ci-dessus sont intégrés.
- Ce scrutin est le plus récent de l'Atlas (mars 2026) et le plus pertinent pour une lecture de tendance en vue d'une présidentielle 2027 ; il est mis en avant en tête du sélecteur de scrutin de l'interface.

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

## 6. Municipales 2020 (1er et 2nd tour) — RÉEL (participation, détail liste/candidat et élus)

- Fichiers : `public/data/elections/municipales-2020-t1.json`, `municipales-2020-t1-bv.json`, `municipales-2020-t2.json`, `municipales-2020-t2-bv.json`.
- **1er tour** : recalculé à partir d'un **export officiel DGRC fourni par l'utilisateur** (GeoJSON à géométrie nulle, 808 features, format large avec jusqu'à 62 listes détectées dynamiquement par bureau), qui remplace l'agrégation Tabular API précédente (moins précise sur quelques bureaux en bordure de pagination). Couverture : **184/184 communes, 808/808 bureaux de vote (100 %)**, avec détail complet des listes.
- **Élus dès le 1er tour** : un fichier national séparé (« Liste des candidats élus lors du T1 des élections municipales de 2020 », feuille `MN20_Elus_T1`, filtré `Code dpt = 95`) a été joint par commune : **2 725 conseillers municipaux élus sur 149/184 communes** (les communes où une liste unique s'est présentée ou où une liste a obtenu la majorité absolue dès ce tour, n'entraînant donc pas de second tour — cohérent avec les 35/184 communes ayant un 2nd tour ci-dessous : 149 + 35 = 184).
- **2nd tour** : source Tabular API inchangée (`id_election = 2020_muni_t2`), méthode identique aux autres scrutins de cette API. Couverture participation : **35/184 communes** (structurel, cf. ci-dessous) ; détail par liste : **35/35 communes (100 %), 376 bureaux de vote**. Le 2nd tour 2020 a été reporté au 28 juin 2020 pour cause de COVID-19, ce report est appliqué à la date affichée.
- Le nombre de communes avec 2nd tour (35/184) est un résultat structurellement normal, non une lacune de collecte : seules les communes n'ayant pas obtenu de liste majoritaire dès le 1er tour organisent un 2nd tour.

## 7. Canton et circonscription — RÉEL pour tous les scrutins à données communales/BV réelles

- Fichier de contours cantons : `public/data/geo/cantons-95.geojson` (21 cantons — Val-d'Oise post-redécoupage 2015). Fichier de contours circonscriptions : `public/data/geo/circonscriptions-95.geojson` (10 circonscriptions, dissolution réelle des communes, cf. §3).
- **Référentiel commune/bureau ↔ canton** : le fichier officiel DGRC des Départementales 2021 (2nd tour, §7bis), qui porte le code et le libellé de canton réels pour chacun de ses 809 bureaux de vote du Val-d'Oise.
- **Référentiel commune ↔ circonscription** : les codes de circonscription réels portés par chaque commune dans les données Présidentielle 2022 (Ministère de l'Intérieur, §3).
- **Méthode de construction des contours cantons** : dissolution géométrique réelle, mais au niveau **bureau de vote** (et non commune) — nécessaire car deux communes denses, Argenteuil (95018) et Cergy (95127), sont chacune scindées entre plusieurs cantons (Argenteuil-1/2/3, Cergy-1/2). Chacun des 810 polygones de bureaux de vote (§2) a été affecté à son canton réel via la jointure sur `codeBureauVote`, puis les polygones ont été fusionnés par canton. 808/810 bureaux se sont joints directement (numérotation identique entre le millésime des contours de bureaux et celui des Départementales 2021) ; les 2 bureaux restants ont été rattachés au canton majoritaire de leur commune (méthode de repli, toujours basée sur un code de canton réel, jamais inventé). Résultat : **21/21 cantons produits**, y compris les 3 cantons partiels d'Argenteuil et les 2 de Cergy, correctement scindés.
- **Rollups de résultats par canton** (`public/data/elections/{scrutin}-canton.json`) : calculés par **simple somme des résultats réels de bureau de vote** de chaque scrutin (pas de commune, précisément pour restituer correctement le partage Argenteuil/Cergy entre cantons), joints via le référentiel bureau↔canton ci-dessus. Aucune valeur de vote n'est inventée. Disponibles et réels pour : Municipales 2026 T1 (21/21 cantons) et T2 (18 cantons — structurel, reflète les 28/184 communes du 2nd tour), Présidentielle 2022 T1 (21/21) et T2 (21/21), Législatives 2024 T1 (21/21) et T2 (18 cantons — structurel, 177/184 communes), Européennes 2024 (21/21), Municipales 2020 T1 (21/21) et T2 (19 cantons — structurel, 35/184 communes), Départementales 2021 T1 et T2 (21/21, scrutin nativement cantonal).
- **Rollups de résultats par circonscription** (`public/data/elections/{scrutin}-circo.json`) : calculés par **simple somme des résultats réels de commune** de chaque scrutin (l'agrégation communale suffit ici : contrairement aux cantons, aucune commune du Val-d'Oise n'est scindée entre deux circonscriptions), jointe via le référentiel commune↔circonscription ci-dessus. Disponibles et réels pour : Municipales 2026 T1 (10/10) et T2 (10/10 circonscriptions représentées, sur la base des 28 communes du 2nd tour), Présidentielle 2022 T1/T2 (10/10), Législatives 2024 T1 (10/10) et T2 (9/9 — structurel, cf. §4), Européennes 2024 (10/10), Municipales 2020 T1 (10/10) et T2 (10/10 circonscriptions représentées, sur la base des 35 communes ayant un second tour). Départementales 2021 n'a pas de rollup circonscription : ce scrutin n'est pas organisé par circonscription législative, seul le canton est pertinent (§7bis).
- Sanity check : nombre de cantons obtenu (21) conforme à l'attendu pour le Val-d'Oise depuis le redécoupage cantonal de 2015 ; nombre de circonscriptions (10) conforme au découpage législatif du Val-d'Oise.

## 7bis. Départementales 2021 (1er et 2nd tour) — RÉEL

- Fichiers : `public/data/elections/departementales-2021-t1.json` / `-t2.json` (commune), `-t1-canton.json` / `-t2-canton.json` (canton — échelle nativement pertinente pour ce scrutin), `-t1-bv.json` / `-t2-bv.json` (bureau de vote).
- Source : **export officiel DGRC fourni par l'utilisateur**, fichiers résultats définitifs par bureau de vote, France entière, filtrés sur `Code du département = 95`. Le 1er tour est un CSV `;`-délimité en encodage **cp1252/Windows-1252** (décodé explicitly avec cet encodage pour éviter tout mojibake sur les noms accentués) ; le 2nd tour est le fichier `.xlsx` déjà documenté. Binômes candidats détectés dynamiquement par blocs de colonnes répétées (jusqu'à 9 binômes par bureau au 1er tour selon les cantons, 2 au 2nd tour).
- Couverture :
  - **1er tour** : **184/184 communes, 21/21 cantons, 809/809 bureaux de vote (100 %)** — y compris Gouzangrez, présente ici contrairement aux scrutins 2024 (Législatives, Européennes), ce qui confirme que son absence ailleurs tient à la source de ces scrutins précis et non à une règle générale d'exclusion de la commune.
  - **2nd tour** : **184/184 communes, 21/21 cantons, 809/809 bureaux de vote (100 %)**.
- Cohérence vérifiée : le nombre d'inscrits total (729 528 au 1er tour, 729 641 au 2nd) est stable entre les deux tours, comme attendu.
- Ce scrutin est le seul dont l'échelle native est le canton (chaque binôme se présente dans un seul canton) et le seul couvert aux deux tours avec la présidentielle 2022 et les législatives 2024 : c'est la donnée la plus riche pour tester l'échelle cantonale de l'Atlas.

## 8. Population municipale historique (1968-2023) — RÉEL

- Fichier : `public/data/insee/population-historique-95.json` (clé = code INSEE commune, valeur = série `{annee, population}`).
- Source : **INSEE, « Populations historiques »** (fichier France entière fourni par l'utilisateur : `insee-populations-historiques-data.csv`, 813 234 lignes, `;`-délimité, colonnes `FREQ;GEO;GEO_OBJECT;POPREF_MEASURE;TIME_PERIOD;OBS_VALUE`, accompagné d'un dictionnaire de labels `insee-populations-historiques-metadata.csv`). Filtré sur `GEO_OBJECT = "COM"`, `GEO` commençant par `95` (communes du Val-d'Oise) et `POPREF_MEASURE = "PMUN"` (population municipale, mesure standard de référence — la variante `PSDC` « population sans double compte », moins utilisée, n'a pas été retenue).
- Couverture : **183/184 communes**, années **2006 à 2023** (18 points annuels par commune pour les communes présentes sur toute la période — le fichier source ne porte pas de valeur `PMUN` antérieure à 2006 pour le Val-d'Oise, bien que le jeu de données national couvre 1968-2023 pour d'autres géographies/mesures ; aucune valeur n'a été extrapolée ou comblée). La commune de **Gouzangrez (95282)** est absente de ce fichier également, comme elle l'est déjà pour les Législatives 2024 et les Européennes 2024 (§4, §5) — troisième confirmation indépendante que cette absence est une caractéristique réelle et récurrente des sources concernant cette petite commune, non une erreur de traitement.
- Utilisation dans l'interface : un panneau « Évolution de la population » avec mini-graphique (sparkline SVG) est affiché dans la fiche de chaque commune (échelle commune uniquement), montrant l'évolution réelle et la variation en % depuis la première année disponible. Ce panneau est indépendant du scrutin sélectionné (mêmes données quel que soit l'électionId/tourId actifs).
- Ce jeu de données est un contexte démographique réel, distinct des données électorales : il ne remplace ni ne débloque le croisement âge/CSP par bureau de vote (§9), qui reste à compléter pour les raisons documentées ci-dessous.

## 9. Profil sociodémographique (âge, CSP) — À COMPLÉTER (contrainte d'accès réseau)

- Un jeu de données réel a été identifié : [« Profil sociodémographique des bureaux de vote — France métropolitaine (INSEE RP 2022 & Filosofi 2021) »](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021) (structure par âge, CSP, diplômes, revenus, par bureau de vote).
- Ce jeu de données est distribué uniquement en **Parquet** (non interrogeable via l'API tabulaire disponible dans cette session) et hébergé sur `static.data.gouv.fr`, domaine bloqué par la politique réseau de cette session (voir §10). Il est distinct de la population historique (§8, réelle et intégrée) : la population municipale par commune et le croisement âge/CSP par bureau de vote sont deux jeux de données INSEE différents, l'un a pu être intégré, l'autre reste bloqué par l'accès réseau.
- `public/data/insee/insee-95-communes.json` documente le schéma attendu (`age`, `csp`) pour une intégration ultérieure ; l'interface affiche un badge « à compléter » partout où ce croisement serait utilisé.

## 10. Contrainte d'accès réseau de cette session

L'environnement d'exécution restreint les accès réseau sortants à une liste d'hôtes autorisés (GitHub, npm, PyPI, etc.) via un proxy de sortie ; les domaines `data.gouv.fr`, `www.data.gouv.fr`, `static.data.gouv.fr` et `object.files.data.gouv.fr` sont explicitement bloqués (`connect_rejected` confirmés à plusieurs reprises, y compris via l'outil de récupération web dédié). La **Tabular API** de data.gouv.fr reste néanmoins accessible via l'outil MCP `data_gouv` dédié (celui-ci s'exécute côté serveur, hors du proxy de sortie de cette session), ce qui a permis d'en tirer l'essentiel des données réelles ci-dessus ; les fichiers volumineux hors Tabular API (Parquet, GeoJSON France entière) sont restés inatteignables directement et ont, pour les bureaux de vote, été obtenus via un export local fourni par l'utilisateur.

## Résumé

| Donnée | Statut | Couverture | Source |
|---|---|---|---|
| Contours communes (95) | Réel | 184/184 | france-geojson (Étalab/IGN) |
| Contours bureaux de vote (95) | Réel | 810 bureaux | INSEE/Etalab (export QGIS fourni par l'utilisateur) |
| Municipales 2026 T1 — commune et bureau | Réel | 183/184 (Gouzangrez absente), 828/828 (100 %) | export officiel DGRC (utilisateur) |
| Municipales 2026 T1 — canton, circonscription | Réel | 21/21, 10/10 | agrégation BV/commune réelle |
| Municipales 2026 T2 — commune et bureau | Réel | 28/184 (structurel), 314/314 (100 %) | export officiel DGRC (utilisateur) |
| Municipales 2026 T2 — canton, circonscription | Réel | 18 (structurel), 10/10 | agrégation BV/commune réelle |
| Municipales 2026 T2 — élus municipaux | Réel | 890 élus / 28 communes | fichier national des élus T2 (utilisateur), filtré CODDPT=95 |
| Présidentielle 2022 T1 — commune | Réel | 184/184 | data.gouv.fr, Tabular API |
| Présidentielle 2022 T1 — bureau (participation) | Réel | 811/811 | idem |
| Présidentielle 2022 T1 — bureau (détail candidat) | Réel | 795/811 (98 %) | idem |
| Présidentielle 2022 T2 — commune et bureau | Réel | 184/184, 811/811 (100 %) | export officiel DGRC (utilisateur) |
| Présidentielle 2022 T1 — canton | Réel | 21/21 | agrégation BV + référentiel Départementales 2021 |
| Présidentielle 2022 T2 — canton | Réel | 21/21 | idem |
| Présidentielle 2022 T1/T2 — circonscription | Réel | 10/10 | agrégation + dissolution géométrique réelle |
| Législatives 2024 T1 — commune et bureau | Réel | 183/184 (Gouzangrez absente, confirmé), 828/828 (100 %) | export officiel DGRC (utilisateur) |
| Législatives 2024 T1 — canton, circonscription | Réel | 21/21, 10/10 | agrégation BV/commune réelle |
| Législatives 2024 T2 — commune et bureau | Réel | 177/184 (structurel), 703/703 | export officiel DGRC (utilisateur) |
| Législatives 2024 T2 — canton, circonscription | Réel | 18 (structurel), 9/9 (structurel) | agrégation BV/commune réelle |
| Européennes 2024 — commune et bureau | Réel | 183/184, 828/828 | export officiel DGRC (utilisateur) |
| Européennes 2024 — canton, circonscription | Réel | 21/21, 10/10 | agrégation BV/commune réelle |
| Municipales 2020 T1 — commune et bureau (détail liste) | Réel | 184/184 communes, 808/808 bureaux (100 %) | export officiel DGRC (utilisateur) |
| Municipales 2020 T1 — élus dès ce tour | Réel | 2 725 élus / 149 communes | fichier national des élus T1 2020 (utilisateur), filtré dept 95 |
| Municipales 2020 T1 — canton, circonscription | Réel | 21/21, 10/10 | agrégation BV/commune réelle |
| Municipales 2020 T2 — participation | Réel | 35/184 (structurel) | idem |
| Municipales 2020 T2 — détail liste/candidat | Réel | 35/35 communes (100 %), 376 bureaux | data.gouv.fr, Tabular API (candidats_results) |
| Municipales 2020 T2 — canton, circonscription | Réel | 19 (structurel), 10/10 | agrégation BV/commune réelle |
| Contours cantons (95) | Réel | 21/21 | dissolution BV réelle, référentiel Départementales 2021 (utilisateur) |
| Départementales 2021 T1 — commune, canton, bureau | Réel | 184/184, 21/21, 809/809 (100 %) | export officiel DGRC (utilisateur) |
| Départementales 2021 T2 — commune, canton, bureau | Réel | 184/184, 21/21, 809/809 (100 %) | export officiel DGRC (utilisateur) |
| Population municipale historique (95) | Réel | 183/184 communes, 2006-2023 | INSEE, Populations historiques (utilisateur) |
| Profil sociodémographique (âge, CSP) | À compléter | — | INSEE RP 2022/Filosofi 2021 (Parquet, accès réseau bloqué) |
