# Atlas électoral du Val-d’Oise

Outil de compréhension territoriale des résultats et de la participation. Sept scrutins, quatre échelles, recherche, fiches, contexte sociodémographique estimé, comparaison temporelle de participation, exports CSV/GeoJSON et fiches imprimables en PDF.

## Usage

- **Explorer les territoires** : choisir un scrutin et une échelle, lire la carte neutre, rechercher un territoire et ouvrir sa fiche. L’extérieur du Val-d’Oise est masqué.
- **Comparer dans le temps** : choisir deux scrutins ; seuls les territoires communaux intégralement comparables sont retenus. Télécharger le tableau ou une note de synthèse.
- **Comprendre les chiffres** : définitions, dénominateurs, points de pourcentage et limites d’interprétation.

Voir [DATA.md](DATA.md) pour la provenance, les contrôles et les limites. Les données sociodémographiques au bureau sont estimées, distinctes des résultats officiels.

## Développement

```sh
npm ci
npm run dev
npm test
npx tsc --noEmit
npm run build:github
```

React, TypeScript, Vite, Leaflet intégré au bundle. GitHub Pages se déploie depuis `main`. Le projet s’ouvre dans une page autonome. La documentation technique complémentaire est dans [PASSATION.md](PASSATION.md).
