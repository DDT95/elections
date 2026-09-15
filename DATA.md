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

## Reproductibilité

`python scripts/rebuild_data.py --sources /chemin/du/cache` (dépendances dans `scripts/requirements.txt`) récupère les nouvelles sources manquantes et régénère les agrégations, contours, masque, contexte et rapport de couverture. Les fichiers BV déjà fournis et les élus municipaux conservés constituent les entrées historiques. Les fichiers nationaux téléchargés restent dans un cache ignoré par Git.

`npm test` vérifie les totaux, les candidats législatifs officiels, les contrôles de comparaison et les cas particuliers. `python scripts/check_geometry.py` vérifie le masque et les géométries. Les assertions arrêtent le traitement en cas d’incohérence, au lieu de combler une valeur.
