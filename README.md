# Atlas électoral du Val-d'Oise

Extrait du module « élections » de l'[Atlas territorial du Val-d'Oise](https://ddt95.github.io/atlas-territorial-95/), packagé pour vivre comme un service autonome. Outil cartographique destiné au cabinet du préfet pour analyser, avant l'élection présidentielle de 2027, les résultats électoraux et la participation par commune, bureau de vote, canton et circonscription, croisés avec les données socio-démographiques INSEE.

Même identité visuelle, même toolchain (Vite + React + TypeScript) et mêmes gabarits (en-tête, tiroir de fiche, impression PDF) que les autres outils de la DDT 95, en particulier [`diagnostic-aide-decision-95`](https://github.com/ddt95/diagnostic-aide-decision-95).

## Fonctionnalités

- **Échelles** : commune (par défaut), bureau de vote, canton, circonscription législative.
- **Élections** : Présidentielle 2022 (1er et 2nd tour, données réelles), Législatives 2024, Européennes 2024, Municipales 2020 (structure prête, à compléter — voir [DATA.md](./DATA.md)). Le panorama est conçu pour accueillir facilement de nouveaux scrutins.
- **Indicateurs cartographiés** : parti/candidat arrivé en tête, score d'un candidat choisi, abstention, participation.
- **Croisement sociodémographique** : structure prête (âge, CSP), à compléter dès l'intégration des fichiers INSEE RP.
- **Fiche par unité** : KPI de participation, tableau des résultats par candidat, impression PDF (A4 paysage) et export GeoJSON (couche entière ou unité sélectionnée).
- **Sources** : dialogue listant chaque source, son producteur et sa fréquence de mise à jour.

## Développement local

```bash
npm install
npm run dev
```

## Build de production (GitHub Pages)

```bash
npm run build:github
```

Le déploiement est automatisé par `.github/workflows/pages.yml` sur push vers `main`.

## Données

Voir [DATA.md](./DATA.md) pour le détail exact de ce qui est réel (avec sources) et de ce qui reste à compléter. Les fichiers sont dans `public/data/` :

- `public/data/geo/communes-95.geojson` — contours des 184 communes du Val-d'Oise.
- `public/data/geo/circonscriptions-95.geojson` — contours des 10 circonscriptions législatives, obtenus par dissolution réelle des communes selon leur code de circonscription officiel.
- `public/data/elections/*.json` — résultats par élection et par tour, au niveau commune, circonscription et bureau de vote.
- `public/data/insee/insee-95-communes.json` — structure prête pour le croisement sociodémographique (à compléter).

## Actualisation des données

Il n'y a pas encore de script d'actualisation automatisée (contrairement à `diagnostic-aide-decision-95`, dont l'API en temps réel se prête à ce mode). Les fichiers `public/data/elections/*.json` sont générés hors-ligne à partir du jeu de données [« Données des élections agrégées »](https://www.data.gouv.fr/datasets/donnees-des-elections-agregees) (data.gouv.fr, résultats bureau de vote agrégés du Ministère de l'Intérieur), filtré sur le Val-d'Oise puis agrégé par commune / circonscription. Pour ajouter un scrutin réel :

1. Identifier l'`id_election` correspondant dans la Tabular API du jeu de données.
2. Filtrer `code_departement = 95`, agréger les lignes bureau de vote par commune.
3. Reproduire le schéma des fichiers `pres-2022-t1.json` / `pres-2022-t1-bv.json` existants.
4. Ajouter l'entrée dans `app/lib/elections.ts`.
