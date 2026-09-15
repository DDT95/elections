# Passation — Atlas électoral du Val-d’Oise

## État de la version de compréhension

L’interface propose trois modes : exploration cartographique et tabulaire, comparaison temporelle communale, explication des indicateurs. Préserver la charte Marianne / bleu institutionnel et la navigation autonome.

### Géographie

Fond neutre CARTO sans libellés ; masque opaque hors département. Les communes antérieures à 2024 utilisent le contour historique ; les scrutins récents utilisent Commeny fusionnée. En 2017, Gadancourt est agrégée avec Avernes, indiqué dans l’interface. Les contours de bureaux et leurs unions restent reconstitués.

### Données

Voir DATA.md. Ne jamais sommer des communes entières pour produire les circonscriptions législatives : Cergy et Sarcelles sont partagées. Ne pas confondre une absence structurelle de second tour avec une donnée manquante. Les calculs de participation passent par les effectifs. Les résultats de candidats de scrutins locaux distincts ne sont pas classés ensemble.

### Fichiers

- `app/ElectionsPage.tsx` : modes, chargement avec erreurs/reprise, tableau, fiche, comparaison, export.
- `app/ElectionMap.tsx` : Leaflet intégré, couches, masque, survol et sélection.
- `app/lib/analysis.ts` : calculs, harmonisation communale, comparaison, contexte estimé.
- `scripts/rebuild_data.py` : import et reconstruction reproductibles.
- `public/data/quality.json` : couverture et manifeste des nouvelles sources.
- `public/print.*` : fiche imprimable multipage. Transmission via un identifiant aléatoire de stockage local, consommé par la page ; aucun accès à window.opener.

### Validation

Exécuter `npm test`, `npx tsc --noEmit`, `npm run build:github`. Pour les modifications géométriques : `python scripts/check_geometry.py` dans l’environnement contenant Shapely. Le pipeline de publication exécute les tests et le contrôle de types avant la compilation.

### Limites restantes

- 8 bureaux des municipales 2020 T2 ont un détail candidat incomplet dans l’ancienne source. Ils sont signalés et exclus de la coloration par candidat.
- Certains résultats de bureaux n’ont pas de contour ; le tableau et le GeoJSON à géométrie nulle les conservent.
- Les correspondances BV de différents millésimes ne garantissent pas la stabilité des périmètres.
- Le contexte sociodémographique est estimé à partir des IRIS, non mesuré au bureau. Ne pas le présenter comme un vote individuel ou une cause.
- Les exports originaux DGRC et INSEE de la première construction ne sont pas tous archivés dans le dépôt.
