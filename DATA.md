# Données et méthode — Atlas électoral du Val-d’Oise

Actualisé le 15 septembre 2026. Cette version remplace les affirmations de couverture et de géographie de la version initiale.

## Résultats et provenance

Sept scrutins sont disponibles : présidentielles 2017 et 2022, départementales 2021, législatives et européennes 2024, municipales 2020 et 2026. Les fichiers de bureaux sont la base des agrégations. `public/data/quality.json` publie, pour chaque tour, le nombre de bureaux avec résultats, avec contour, sans contour et sans rattachement, ainsi que les URLs, identifiants de ressources et empreintes SHA-256 des nouveaux téléchargements.

- **Présidentielle 2022 T1** : remplacée intégralement par l’export définitif officiel TXT du ministère de l’Intérieur. 811 bureaux, tous les candidats, 184 communes historiques. Les lacunes de pagination de la première version sont supprimées.
- **Présidentielle 2017 T1/T2** : exports définitifs officiels TXT par bureau, 800 bureaux, 185 communes d’origine. Gadancourt est regroupée avec Avernes dans les fichiers communaux pour correspondre à la géographie disponible (184 unités). Les fichiers BV conservent les identifiants d’origine.
- **Législatives 2024 T1/T2** : résultats DGRC déjà présents. Rattachement de chaque bureau au scrutin législatif à partir des candidats et du registre officiel par circonscription. L’unicité est imposée. Les six totaux (inscrits, votants, abstentions, exprimés, blancs, nuls) de chaque circonscription sont comparés aux exports officiels. Les candidats et leurs voix sont également vérifiés dans les tests. Au second tour : **8 circonscriptions** ; les 5e et 8e sont pourvues au premier tour. Sarcelles et Cergy ne peuvent pas être affectées chacune à une seule circonscription.
- **Autres scrutins** : fichiers DGRC fournis lors de la construction, conservés au bureau ; municipales 2020 T2 issues de l’ancienne récupération Tabular API. Les noms, votes, élus et effectifs ne sont pas inventés. Les élus municipaux précédemment intégrés sont conservés dans `public/data/elus-municipaux.json` et les résultats communaux correspondants.
- **Municipales 2026 T2** : date corrigée au **22 mars 2026**.
- **Municipales 2020 T1** : certains bulletins permettent plusieurs suffrages (ancien régime des petites communes). Une somme des voix supérieure aux exprimés n’est pas interprétée comme un résultat de liste ; le statut `multi_vote` désactive la carte par candidat.
- **Municipales 2020 T2** : 8 bureaux ont une somme des voix différente des exprimés dans la source héritée. Ils sont signalés `partial` ; leur participation reste utilisable, mais aucun candidat en tête n’est déduit. Un export officiel complet reste à intégrer pour ce tour.

## Bilan départemental — parlementaires et conseil départemental

Ajouté sur demande de la préfecture dans l'« Analyse départementale » (web et PDF) :

- **Députés élus** : dérivés des résultats réels déjà présents (`legislatives-2024-t2-circo.json`, complété par `legislatives-2024-t1-circo.json` pour les 5e et 8e circonscriptions, décidées dès le premier tour — voir ci-dessus). Aucune donnée nouvelle, simple lecture du candidat en tête par circonscription.
- **Conseil départemental** : dérivé des résultats réels des départementales 2021 T2 par canton (`departementales-2021-t2-canton.json`), binôme en tête par canton (21 cantons × 2 = 42 sièges).
- **Sénateurs** : aucune élection sénatoriale dans les jeux de données de ce projet (scrutin indirect par grands électeurs, hors périmètre des sources data.gouv.fr utilisées ailleurs pour les autres scrutins). Liste des 5 sénateurs du Val-d'Oise (élus en septembre 2023, mandat jusqu'en 2029) saisie manuellement dans `app/ElectionsPage.tsx` (constante `SENATORS`), chaque nom et groupe politique vérifié individuellement sur sa fiche officielle senat.fr :
  - [Arnaud Bazin (LR)](https://www.senat.fr/senateur/bazin_arnaud19667j.html)
  - [Jacqueline Eustache-Brinio (LR)](https://www.senat.fr/senateur/eustache_brinio_jacqueline19673g.html)
  - [Daniel Fargeot (Union centriste)](https://www.senat.fr/senateur/fargeot_daniel21086n.html)
  - [Rachid Temal (Socialiste)](https://www.senat.fr/senateur/temal_rachid19669l.html)
  - [Pierre Barros (Communiste républicain citoyen et écologiste - Kanaky)](https://www.senat.fr/senateur/barros_pierre21084l.html)

  À vérifier/mettre à jour manuellement en cas de démission, décès ou nouvelle élection sénatoriale (prochain renouvellement de la série du Val-d'Oise : 2029) — cette liste n'est pas rafraîchie automatiquement.

## Agrégations

Les effectifs sont additionnés puis les taux recalculés. Aucune moyenne simple de pourcentages n’est utilisée. Une commune, un canton ou une circonscription regroupant plusieurs scrutins locaux porte `mixed_contests` : l’interface masque le classement commun et la coloration par candidat. Les résultats de participation restent lisibles. La mention « complet » correspond au contrôle arithmétique, pas à une certification de la géométrie.

Les cantons utilisent le référentiel BV des départementales 2021 ; les autres bureaux sont affectés seulement lorsque leur commune possède un unique canton dans ce référentiel. Gadancourt est rattachée à Vauréal (21), selon l’INSEE et l’arrêté de fusion de 2017. Les circonscriptions utilisent les codes des sources présidentielles et le registre 2024 ; le repli communal n’est autorisé que pour une commune non partagée. Ces correspondances de millésimes différents restent une limite pour les analyses spatiales anciennes.

Pour les seconds tours, le nombre de bureaux présents est comparé à celui du premier tour. Un territoire dont seule une partie revote porte `partial_scope`. L’absence d’un second tour ne devient jamais un zéro.

## Géographie et fond de carte

- Communes historiques : fichier `france-geojson` déjà fourni, 184 unités après fusion Avernes/Gadancourt.
- Communes depuis 2024 : 183 unités, union de Commeny (95169) et Gouzangrez (95282). [INSEE Commeny](https://www.insee.fr/fr/metadonnees/geographie/commune/95169-commeny).
- Gadancourt a fusionné avec Avernes au 1er janvier 2018. Les résultats communaux 2017 réunissent ces deux communes et l’interface l’indique. [INSEE Avernes](https://www.insee.fr/fr/metadonnees/geographie/commune/95040-avernes).
- Bureaux : 810 contours reconstitués fournis par l’utilisateur lors de la construction. Ils ne sont **pas des limites administratives opposables**. Pour 2024 T1, 809 des 828 identifiants de résultats se joignent à la carte (19 sans contour). Ces résultats restent accessibles dans le tableau et les exports ; l’export GeoJSON les conserve avec une géométrie nulle.
- Cantons et circonscriptions : unions des contours BV associés, non unions de communes entières. Elles restent des géométries de repérage, conditionnées par les contours BV disponibles.
- Fond CARTO clair sans libellés, niveaux de gris. Masque extérieur opaque calculé comme la différence entre une emprise couvrant la carte et l’union des communes du département. Les résultats ne sont pas tronqués par ce masque dans les exports.

## Comparaison temporelle

La comparaison porte sur la participation et le nombre de votants, au niveau communal. Les communes présentes intégralement dans les deux scrutins sont retenues. Commeny/Gouzangrez et Avernes/Gadancourt sont réunies. Chaque taux global est recalculé sur les inscrits de son scrutin et du périmètre commun. Les communes partiellement concernées par un second tour sont exclues.

Ce n’est pas un suivi des mêmes personnes : les inscrits évoluent. Le corps électoral et la mobilisation peuvent différer entre types de scrutins. Les municipales 2020 ont eu lieu dans le contexte de la pandémie. Une variation n’identifie pas les transferts de voix et ne constitue pas une prévision pour 2027.

## Contexte sociodémographique

Source téléchargée : [Profil sociodémographique des bureaux de vote](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021), produit par le **projet André**, Licence Ouverte 2.0. Il s’agit d’**estimations par interpolation spatiale** des IRIS INSEE, pondérées par le bâti et les logements. Ce ne sont pas des observations INSEE directement mesurées au bureau.

810 bureaux du Val-d’Oise dans le fichier. L’atlas conserve uniquement les effectifs nécessaires à l’âge (RP 2022), aux CSP et au diplôme. Les variables d’origine et indices composites ne sont pas utilisés. Les revenus médians interpolés ne sont pas agrégés.

- 15–24 ans et 65 ans et plus : dénominateur `P_POP`.
- Cadres et ouvriers : somme des huit catégories `C_POP15P_CS1..8` (exploitation complémentaire).
- Diplôme supérieur : `P_NSCOL15P_SUP2 + SUP34 + SUP5`, dénominateur `P_NSCOL15P`.

Les effectifs sont additionnés avant division ; les valeurs absentes restent absentes. La couverture des bureaux est affichée. Des bureaux d’un autre millésime peuvent avoir le même identifiant sans le même contour. Ces statistiques décrivent les habitants, pas les électeurs, et ne permettent aucune inférence sur le comportement individuel ni démonstration causale.

Population historique : série INSEE PMUN fournie lors de la construction, 2006–2023, 183 communes. Cette série est indépendante du scrutin sélectionné et de l’estimation par bureau. Son export original n’est pas dans le dépôt ; sa géographie de diffusion doit être vérifiée avant toute analyse supplémentaire des fusions.

### Contexte socio-économique (niveau de vie, pauvreté, CSP)

Ajouté à la fiche territoriale (commune et département, web et PDF) sous « Contexte socio-économique » : niveau de vie médian, taux de pauvreté et répartition par catégorie socioprofessionnelle (population de 15 ans ou plus, actifs et inactifs confondus).

- **Source** : [DDT95/VO-Insee](https://github.com/DDT95/VO-Insee) ([site](https://ddt95.github.io/VO-Insee/)), qui calcule déjà ces indicateurs à partir de la **Base du dossier complet Insee** (RP2023, Filosofi 2023) — observations directes, pas une interpolation. `scripts/build_contexte_socio_eco.py` télécharge `data/processed/commune_profiles.json` et `departement_profile.json` depuis ce dépôt et en extrait uniquement `niveau_vie_median`, `taux_pauvrete` et `categorie_socioprofessionnelle` vers `public/data/insee/contexte-socio-eco.json` — aucun recalcul, aucune donnée inventée.
- **Secret statistique** : Filosofi masque les communes de moins de 50 ménages fiscaux. Ces communes (6 dans le Val-d’Oise au moment de l’extraction) affichent `quality_flag: "secret"` et une valeur `null` pour le niveau de vie médian et le taux de pauvreté ; l’interface affiche alors « Non disponible », jamais un zéro ou une estimation.
- **Taux de chômage** : demandé mais **non affiché**. VO-Insee prévoit un indicateur `chomage_rp` (RP2023, champ 15-64 ans) d’après son code source, mais ce champ n’était présent dans aucun profil (commune, département) au moment de cette extraction (14 septembre 2026) — probablement pas encore régénéré côté VO-Insee. À réintégrer via une nouvelle exécution de `build_contexte_socio_eco.py` dès que ce champ apparaît dans les fichiers sources, sans qu’aucune valeur ne soit estimée dans l’intervalle.
- **Mise à jour** : relancer `python3 scripts/build_contexte_socio_eco.py` (nécessite un accès réseau à raw.githubusercontent.com) régénère `public/data/insee/contexte-socio-eco.json` depuis la dernière version commitée de VO-Insee.

### Report de voix RN/union de la gauche (législatives 2024, second tour)

Sur l'« Analyse départementale », le bloc « Second tour simulé : RN face à l'union de la gauche » applique aux scores Européennes 2024 (1 tour) un report de voix mesuré, pas supposé.

- **Méthode** : `scripts/build_report_voix_legislatives.py` compare, circonscription par circonscription, les résultats du 1er et du 2nd tour des législatives 2024 déjà présents dans ce dépôt (`legislatives-2024-t1-circo.json` / `-t2-circo.json`). Sur les circonscriptions où le RN a affronté l'union de la gauche en **duel strict** (2 candidats au 2nd tour, aucun candidat Centre/Droite maintenu) : `report = (voix T2 − voix T1) / (exprimés T1 − voix gauche T1 − voix RN T1)`, agrégé pondéré (pas une moyenne de pourcentages) sur l'ensemble des duels.
- **Résultat (14 septembre 2026)** : 5 duels UG/RN dans le Val-d'Oise (circonscriptions 02, 03, 07, 09, 10) sur les 6 qualifications RN au 2nd tour. Report mesuré : 57,2 % du réservoir Centre/Droite du 1er tour vers l'union de la gauche, 20,2 % vers le RN, le reste (22,7 %) correspond à l'écart de participation entre les deux tours. Deux triangulaires (circonscriptions 01, 06, où un candidat Centre s'est maintenu) sont exclues du calcul du taux — leur dynamique de report est différente (pas de retrait) — mais listées à part dans `report-voix-legislatives-2024.json` pour audit.
- **Application** : le réservoir « Centre + Droite » du score Européennes 2024 départemental (sensibilités déjà chargées) est redistribué selon ce taux pour simuler un duel RN/union de la gauche à l'échelle du département. C'est une hypothèse construite à partir d'un report réel mesuré sur un autre scrutin, pas une prévision — présenté comme tel dans l'interface.
- **Périmètre** : Val-d'Oise uniquement. Aucune comparaison nationale : demanderait de moissonner les résultats candidat par candidat des 577 circonscriptions françaises (non fait, aucune source déjà chargée dans ce dépôt ne le couvre) — signalé explicitement dans l'interface plutôt que de citer un chiffre non sourcé dans ce dépôt.
- **Sortie** : `public/data/elections/report-voix-legislatives-2024.json` (source, méthode, détail par circonscription, agrégat). Relancer `python3 scripts/build_report_voix_legislatives.py` (aucun accès réseau requis, les fichiers sources sont déjà dans le dépôt) pour régénérer.

### Référence multi-scrutins (second tour simulé, écarts des scénarios)

Le second tour simulé et les écarts affichés sur chaque scénario de participation (« vs réf. ») ne se basent plus sur les seules européennes 2024, mais sur une **moyenne de 3 scrutins**, détaillée et affichée en toute transparence dans le bloc « Méthode : une référence à partir de 3 scrutins » de l'« Analyse départementale » (web et PDF), juste après le second tour simulé.

- **Pourquoi une moyenne** : les dynamiques d'un scrutin présidentiel (participation nettement plus élevée, vote personnalisé sur un candidat) ou d'une législative (la gauche se présente unie sous l'étiquette NFP) diffèrent de celles d'une élection de liste comme les européennes. Juger les scénarios de participation contre un seul scrutin biaiserait la lecture — la référence combine donc européennes 2024, législatives 2024 (1er tour) et présidentielle 2022 (1er tour), à parts égales.
- **Niveau des grandes sensibilités** (Extrême gauche/Gauche/Centre/Droite/Extrême droite, utilisé pour le second tour simulé et les barres « Sensibilités simulées ») : moyenne simple des 3 scrutins (`politicalScores(x,"sensitivity")` sur chacun, puis moyenne). Les 3 scrutins classifient correctement chaque sensibilité, y compris la gauche unie (NFP) aux législatives, qui compte normalement dans le bloc « Gauche ».
- **Niveau du détail par parti** (LFI, social-démocratie, PCF, RN, Reconquête — utilisé pour « Détail Gauche »/« Détail Extrême droite » et le donut « Rapport de force — toutes les composantes ») : moyenne d'européennes 2024 et présidentielle 2022 **uniquement**, législatives exclues. Aux législatives 2024, la gauche se présente unie sous une seule étiquette (nuance `UG`/`UGE`), sans détail par parti — l'inclure fausserait la part de LFI (actuellement classée `social_left` dans `politicalGroup()`, faute de mieux).
- **Calcul** : `buildDepartmentScenarios()` dans `app/ElectionsPage.tsx` — `averageScores()` moyenne les scores de plusieurs résultats agrégés (`aggregateDepartment`). Le mécanisme de simulation des scénarios (redistribution du vote par commune selon un facteur de participation hypothétique) reste, lui, basé uniquement sur les vrais bulletins communaux des européennes 2024 : mélanger des candidats de 3 scrutins différents dans une même simulation de réattribution de voix n'aurait pas de sens (ce ne sont pas les mêmes candidats).
- **Constat (16 septembre 2026)** : la référence (Gauche 41,4 %, Extrême droite 27,8 %, Centre 20,2 %, Droite 6,8 %) diffère nettement des européennes 2024 seules (43,6/31,7/12,6/7,4) — le Centre notamment presque doublé (12,6 % → 20,2 %), tiré par les législatives et la présidentielle où les candidats Ensemble/centristes ont mieux marché qu'aux européennes. Le second tour simulé passe de 65,1/34,9 (référence européennes seules) à 67,9/32,1 (référence multi-scrutins) au bénéfice de l'union de la gauche : avec un réservoir Centre + Droite plus large dans la nouvelle référence, le report de voix mesuré (57,2 % vers la gauche) profite davantage à l'union de la gauche.
- **Portée** : département uniquement.

## Reproductibilité

`python scripts/rebuild_data.py --sources /chemin/du/cache` (dépendances dans `scripts/requirements.txt`) récupère les nouvelles sources manquantes et régénère les agrégations, contours, masque, contexte et rapport de couverture. Les fichiers BV déjà fournis et les élus municipaux conservés constituent les entrées historiques. Les fichiers nationaux téléchargés restent dans un cache ignoré par Git.

`npm test` vérifie les totaux, les candidats législatifs officiels, les contrôles de comparaison et les cas particuliers. `python scripts/check_geometry.py` vérifie le masque et les géométries. Les assertions arrêtent le traitement en cas d’incohérence, au lieu de combler une valeur.
