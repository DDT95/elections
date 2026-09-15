# Passation — Atlas électoral du Val-d’Oise

## Version publiée

- Site : https://ddt95.github.io/elections/
- Branche : `main`
- Dernier commit publié : `a45ddfa`
- Déploiement GitHub Pages validé le 15 septembre 2026.
- Arbre de travail propre avant cette mise à jour de passation.

## Demande produit à préserver

L’outil doit être une synthèse électorale lisible, pas un simple site de résultats. Il doit distinguer clairement :

1. le résultat du scrutin choisi ;
2. les moyennes calculées sur plusieurs scrutins ;
3. l’évolution des grandes sensibilités politiques ;
4. les scénarios de participation, avec leur méthode expliquée.

Les candidats et listes doivent toujours être accompagnés de leur parti ou de leur sensibilité. Éviter toute mention « données réelles » ou « réel ». Le pied des PDF doit contenir seulement les sources.

## Interface cartographique

- Échelles disponibles sous forme de switches : communes, EPCI, cantons et circonscriptions législatives.
- La carte démarre uniforme et neutre (`metric = "none"`). Ne pas réintroduire la mosaïque pastel aléatoire.
- Une sélection explicite d’élection ou de tour active la coloration par grande tendance politique.
- Le clic sur un territoire ouvre une fiche avec ses données électorales et son analyse historique.
- L’analyse départementale s’ouvre dans une fenêtre centrée.
- Le bouton d’export GeoJSON est placé tout en bas du menu.
- Les listes d’élection et de tour sont de vraies listes déroulantes visuellement sobres.

## Contenu des fiches territoriales

- Participation du scrutin et abstention du scrutin.
- Participation moyenne et abstention moyenne calculées avec les tours disponibles à l’échelle choisie.
- Le bloc « Résultats du scrutin sélectionné » montre uniquement le scrutin et le tour actifs, avec les quatre premiers et leur parti ou sensibilité.
- L’historique multi-scrutins n’est plus mélangé à ce bloc. Il alimente les moyennes et l’évolution politique.
- Évolution politique sur quatre scrutins nationaux : présidentielle 2017 T1, présidentielle 2022 T1, européennes 2024 et législatives 2024 T1.
- Sensibilités : extrême gauche, gauche, centre, droite, extrême droite. Le NFP 2024 est compté dans la gauche.
- Une sensibilité moyenne du territoire est calculée sur ces quatre scrutins.
- Le graphique de population précise visuellement une échelle resserrée afin d’éviter de laisser croire que la population tombe à zéro.

## Analyse départementale

- Présentation verticale et centrée, alignée sur la forme des fiches communales.
- Bilan sociodémographique.
- Bilan électoral avec titre du scrutin de référence, partis/sensibilités et couleurs politiques.
- Participation moyenne, niveau haut et niveau bas.
- Évolution politique multi-scrutins.
- Scénarios de participation expliqués : participation habituelle, participation haute, territoires jeunes et rattrapage de l’abstention.
- Tableau d’impact des scénarios par sensibilité.

## PDF commune et département

- Ouverture dans une page PDF/impression dédiée via `public/print.html`, `public/print.js` et `public/print.css`.
- Le titre distingue correctement commune et département.
- Résultats limités au scrutin sélectionné, avec parti ou sensibilité.
- Participation et abstention moyennes calculées sur l’historique disponible.
- Section « Évolution politique » reproduisant la dataviz validée : cinq lignes de sensibilités, quatre colonnes de scrutins, valeur par scrutin et évolution en points.
- Pied de page limité aux sources.

## Données et géographies ajoutées

- EPCI : `public/data/geo/epcis-95.geojson` et `public/data/geo/communes-epci-95.json`.
- Historiques complets chargés pour communes, cantons et circonscriptions afin de calculer les moyennes.
- Ne jamais sommer naïvement des communes entières pour les circonscriptions : Cergy et Sarcelles sont partagées.
- Les calculs de participation doivent rester pondérés par les effectifs.

## Correspondances politiques actuelles

La fonction `partyLabel` de `app/ElectionsPage.tsx` traduit notamment :

- La France revient / Bardella / Le Pen → Rassemblement national ;
- LFI / Mélenchon → La France insoumise ;
- Besoin d’Europe / Macron → Renaissance · MoDem · Horizons ;
- Réveil Eur → Parti socialiste · Place publique.

Compléter ces correspondances quand une liste reste affichée sans parti exploitable.

## Point non terminé

Les tranches d’âge 24–40 ans et 40–65 ans n’ont pas été ajoutées. Le jeu INSEE actuellement embarqué ne fournit que les indicateurs déjà utilisés, notamment 15–24 ans et 65 ans ou plus. Il faut importer une source d’âge plus détaillée avant de les calculer ; ne pas inventer ces valeurs.

## Fichiers principaux

- `app/ElectionsPage.tsx` : interface, carte, agrégations, fiches, analyse départementale, partis et scénarios.
- `app/globals.css` : mise en page et datavisualisations.
- `public/print.js` et `public/print.css` : PDF commune/département.
- `public/data/` : résultats et géographies.
- `DATA.md` : règles et limites des données.

## Validation avant publication

Exécuter :

```sh
npx tsc --noEmit
npm run build:github
npm test
git diff --check
```

Puis pousser sur `main` et attendre la réussite du workflow GitHub Pages.
