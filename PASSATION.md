# Passation — Atlas électoral du Val-d'Oise

> Rédigé le 15 septembre 2026, à l'issue de la première session de construction. Le site est mergé sur `main`, publié via GitHub Pages, et lié depuis la page d'accueil de l'Atlas territorial.

## 0. Addendum — session du 15 septembre 2026 (recadrage « outil d'analyse »)

Sur retour direct de la préfecture après mise en ligne, cette seconde session (même jour) a traité :

1. **Recadrage éditorial** : la page se présentait comme une page de résultats bruts ; recadrée en outil d'analyse (« Analyser un scrutin » en intro, infobulle de survol reformulée en « tendance » + incitation au clic pour la synthèse, wording « synthèse » à la place de « fiche »).
2. **Simplification des échelles** : canton et circonscription retirés de la sélection de couches (pas de vraies limites administratives, lecture pas encore clarifiée) ; bureau de vote retiré également sur demande explicite ultérieure. Seule **Commune** reste sélectionnable. Le code de rendu des 3 échelles retirées est conservé intact (non supprimé) pour réactivation sans refonte — voir les commentaires « pour le moment » dans `app/ElectionsPage.tsx`.
3. **EPCI ajoutée à l'interface mais désactivée** (« à compléter ») : la préfecture veut l'intercommunalité comme échelle d'analyse, mais la table de correspondance commune ↔ EPCI n'a pas pu être obtenue dans cet environnement (mêmes blocages réseau que le croisement sociodémographique, §5 point 1 ci-dessous, et geo.api.gouv.fr en plus) — voir DATA.md §7ter pour le détail des trois pistes tentées et la méthode à suivre pour compléter.
4. **Corrigé un vrai bug de production signalé par l'utilisateur en cours de session : carte vierge à l'ouverture.** Cause : Leaflet chargé exclusivement depuis `unpkg.com` (CDN public). Sur un réseau qui bloque les CDN publics — constaté dans l'environnement de développement de cette session lui-même (`unpkg.com` y renvoie un rejet de connexion, exactement le symptôme signalé) — le script Leaflet ne se charge jamais, `mapReady` ne s'incrémente jamais, et la carte reste vierge indéfiniment ; le correctif `mapReady` du §4 ci-dessous ne peut rien face à ce cas puisqu'il rejoue l'effet une fois la carte prête, mais la carte n'est jamais prête si le script ne charge jamais. **Correctif : Leaflet est maintenant auto-hébergé** (`public/vendor/leaflet/`, ~190 Ko copiés depuis `node_modules/leaflet/dist` — jamais un import npm en production, juste des fichiers statiques servis avec le site), chargé en priorité, avec repli automatique sur unpkg si la copie locale est introuvable (jamais l'inverse). **Ceci déroge délibérément à la convention §2 ci-dessous** (« carte Leaflet chargée depuis unpkg... comme tous les outils de l'Atlas ») pour cet outil précis, à cause de ce bug réel ; si le même problème est constaté sur d'autres outils de l'Atlas (`diagnostic-aide-decision-95` notamment), la même correction devrait probablement y être portée. Vérifié par un test Playwright avec `unpkg.com` entièrement bloqué au niveau réseau : la carte se peuple normalement (184 communes) sans aucune erreur console — voir DATA.md pour le détail.
5. **Lien « ← Retour à l'Atlas »** : vérifié présent, avec URL absolue correcte, sur le logo et sur le bouton dédié — conforme au §2/§8 ci-dessous. Le signalement utilisateur en session portait vraisemblablement sur un autre outil de l'Atlas (le bug exact déjà documenté au §2 pour `diagnostic-aide-decision-95`) : cette session n'a accès qu'au dépôt `elections`, donc si le problème persiste ailleurs, il reste à corriger dans le dépôt concerné.

Fichiers modifiés : `app/ElectionsPage.tsx`, `app/globals.css`, `DATA.md`, plus l'ajout de `public/vendor/leaflet/` (nouveaux fichiers statiques).

## 1. Objectif du projet

Donner au cabinet du préfet du Val-d'Oise un outil d'analyse territoriale des résultats électoraux, en préparation de la présidentielle 2027 : croiser les résultats de plusieurs scrutins (présidentielle, législatives, européennes, départementales, municipales) à quatre échelles de lecture (commune, bureau de vote, canton, circonscription), avec un volet socio-démographique (âge, CSP) encore à compléter.

Ce n'est pas un site grand public : c'est un outil métier, mais qui doit rester lisible et agréable à utiliser (cf. §5, demande de la préfecture d'un rendu « ludique mais institutionnel »).

## 2. Identité graphique à respecter

- Titre exact : **Atlas électoral du Val-d'Oise**.
- Calqué sur `diagnostic-aide-decision-95` : police Marianne, tokens `--blue:#000091 --deep:#070047 --cyan:#4fd1ff`, carte Leaflet 1.9.4 chargée depuis unpkg (comme tous les outils de l'Atlas — jamais installée en dépendance npm de production), tiroir latéral droit (« fiche ») avec sections à bordure colorée, impression PDF via une page `print.html` séparée ouverte dans un nouvel onglet (`html2canvas` + `jsPDF`).
- **Lien « ← Retour à l'Atlas » qui fonctionne vraiment** : il pointe vers l'URL absolue `https://ddt95.github.io/atlas-territorial-95/`, jamais vers un `basePath` relatif. C'est un bug réel identifié sur `diagnostic-aide-decision-95` (le logo n'y ramène jamais à l'Atlas) — ne pas reproduire cette régression ici.
- Couleurs de nuance politique **cohérentes avec les conventions des médias français** (voir `app/lib/nuances.ts` et DATA.md §« Note d'interface »), jamais de logo ou d'emblème de parti (risque juridique sur un outil de préfecture).

## 3. État publié

- Dépôt : https://github.com/DDT95/elections
- Site : https://ddt95.github.io/elections/ (se déploie automatiquement sur push vers `main` via `.github/workflows/pages.yml` — vérifier l'onglet Actions du dépôt après tout merge pour confirmer que le déploiement a réussi)
- `main` est à jour du commit `74815fb` (merge de la PR #1, elle-même construite sur 7 commits : `3101452` → `b05d6d6`)
- Lien ajouté sur la page d'accueil de l'Atlas territorial (`atlas-territorial-95`, PR #8 mergée, commit `6d16bc7`) : carte « Atlas électoral du Val-d'Oise » juste à côté de « Outils d'aide à la décision »

Le site public contient déjà :

- la carte Leaflet avec 4 échelles (commune / bureau de vote / canton / circonscription), toutes avec des contours réels ;
- le sélecteur de scrutin (6 scrutins réels : Municipales 2026, Présidentielle 2022, Législatives 2024, Européennes 2024, Départementales 2021, Municipales 2020) et d'indicateur cartographié (tête de liste, score d'un candidat, abstention, participation) ;
- le survol (highlight + infobulle collée au curseur) et la sélection persistante (halo distinct), sans conflit entre les deux ;
- le tiroir de fiche par unité sélectionnée, avec résultats réels par candidat/liste sous forme de cartes colorées par nuance politique, badge du candidat en tête, participation, et — au niveau commune — un mini-graphique d'évolution de la population INSEE ;
- l'impression PDF de la fiche et de la carte ;
- l'export GeoJSON de la couche affichée ;
- une boîte de dialogue « Sources, millésimes et licences ».

## 4. Bug critique corrigé pendant la session — à ne pas réintroduire

**Symptôme observé en QA (Playwright) :** cliquer sur n'importe quelle commune faisait disparaître toute la carte (polygones effacés), sans aucune erreur console.

**Cause réelle :** un état React censé signaler que la carte Leaflet était prête (`mapReady`, à l'origine nommé différemment) n'était jamais lu nulle part — donc jamais présent dans le tableau de dépendances de l'effet qui construit la couche GeoJSON. Si le script Leaflet (chargé depuis unpkg, donc asynchrone et de durée variable) mettait plus de temps à charger que les fetches de données, l'effet abandonnait une fois (« carte pas encore prête ») et n'était **jamais rejoué** une fois la carte réellement prête. Le bug semblait lié au clic uniquement parce que le timing des tests le faisait coïncider avec le moment où l'utilisateur interagissait.

**Le correctif** (commit `4c7d6da`) : l'état est effectivement consommé et ajouté aux dépendances de l'effet. Si une future modification touche au chargement de Leaflet ou à l'effet qui construit les couches (`app/ElectionsPage.tsx`), vérifier explicitement que tout état représentant un prérequis asynchrone (carte prête, données chargées, etc.) est bien lu quelque part et présent dans un tableau de dépendances — un état « mort » de ce genre ne provoque aucune erreur TypeScript ni console, il rend juste un effet silencieusement obsolète.

**Comment vérifier qu'on ne l'a pas réintroduit** : `npm run dev`, ouvrir la page, cliquer sur plusieurs communes différentes, changer de scrutin en cliquant après chaque changement. La carte doit rester peuplée à chaque étape et le tiroir doit s'ouvrir avec les vraies données de l'unité cliquée. (Seule l'échelle Commune est sélectionnable dans l'interface depuis la session du 15 septembre 2026, §0 — mais si bureau de vote/canton/circonscription sont réactivés un jour, retester aussi les changements d'échelle comme avant.)

## 5. Ce qui reste à faire

Par ordre de valeur probable pour la préfecture :

0. **Échelle EPCI (intercommunalité)** — demandée explicitement par la préfecture (§0), affichée dans l'interface mais désactivée (« à compléter ») faute de table de correspondance commune ↔ EPCI accessible dans cet environnement réseau restreint. Voir DATA.md §7ter pour les pistes déjà tentées (toutes bloquées) et la méthode d'intégration une fois l'accès réseau disponible (dissolution des contours communaux déjà réels, sur le même principe que les cantons au §7, puis agrégation communale simple comme les circonscriptions).
1. **Croisement socio-démographique (âge, CSP) par bureau de vote** — bloqué uniquement par une contrainte réseau de la session de construction (le fichier source INSEE est en Parquet, hébergé sur un domaine que le proxy sortant de cet environnement refuse — voir DATA.md §9-10). Le jeu de données existe et est identifié : [« Profil sociodémographique des bureaux de vote — France métropolitaine (INSEE RP 2022 & Filosofi 2021) »](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021). Dans un environnement avec accès réseau complet, le télécharger, le filtrer sur le Val-d'Oise et l'intégrer dans `public/data/insee/insee-95-communes.json` (schéma déjà prêt) devrait suffire à activer automatiquement la section « Croisement sociodémographique » déjà présente dans l'interface (actuellement affichée en « à compléter »).
2. **Résultats canton/circonscription pour tous les scrutins** — déjà fait pour tous les scrutins ayant des données réelles au niveau commune/BV (voir tableau DATA.md), donc en fait **déjà largement traité**. Vérifier simplement qu'aucun nouveau scrutin ajouté par la suite n'oublie cette étape d'agrégation (méthode documentée en DATA.md §7).
3. **1er tour des Départementales 2021 pour circonscription** — non applicable, ce scrutin n'est pas organisé par circonscription (canton uniquement, déjà réel).
4. **Détail candidat Présidentielle 2022 T1** — 795/811 bureaux (98 %), quelques bureaux en bordure de pagination de l'API tabulaire n'ont pas les 12 candidats complets. Un export DGRC officiel équivalent à celui obtenu pour le 2nd tour comblerait ce dernier 2 %.
5. **Scrutins plus anciens** (présidentielle 2017, législatives 2022, municipales 2014...) — hors périmètre de cette première session, mais l'architecture (schéma JSON par scrutin/tour, sélecteur dynamique) est prête à en accueillir d'autres sans refonte.

## 6. Fichiers structurants

- `app/ElectionsPage.tsx` — composant principal : carte, sélecteurs, tiroir de fiche, effets de survol/sélection, export GeoJSON, déclenchement de l'impression.
- `app/lib/elections.ts` — chargement et normalisation des données de résultats par scrutin/échelle.
- `app/lib/nuances.ts` — table de correspondance nuance politique → couleur/famille (voir §2).
- `app/lib/color.ts` — résolution de couleur par candidat (nuance en priorité, table par nom en repli pour la Présidentielle 2022).
- `app/globals.css` — charte graphique complète (`.decision-*`-like, classes `election-*`).
- `public/print.html` / `public/print.css` / `public/print.js` — page d'impression PDF séparée.
- `public/data/geo/*.geojson` — contours réels (communes, bureaux de vote, cantons, circonscriptions).
- `public/data/elections/*.json` — résultats par scrutin/tour/échelle.
- `public/data/insee/population-historique-95.json` — population municipale réelle par commune (panneau fiche commune).
- `public/data/insee/insee-95-communes.json` — schéma prêt, vide, pour le croisement âge/CSP (§5.1).
- `config/election-sources.json` — liste des sources affichée dans la boîte de dialogue « Sources ».
- `public/vendor/leaflet/` — copie auto-hébergée de Leaflet 1.9.4 (JS, CSS, icônes marqueur), source primaire de chargement depuis la session du 15 septembre 2026 (§0) ; unpkg reste un repli automatique.
- `DATA.md` — provenance détaillée de **chaque** donnée, à tenir à jour à chaque ajout de source.

## 7. Validation avant toute publication

```bash
npm install
npx tsc --noEmit
npm run build:github
```

Pour une vérification fonctionnelle réelle (le typecheck et le build ne suffisent pas à détecter un bug comme celui du §4) : lancer `npm run dev`, ouvrir dans un navigateur, et dérouler manuellement le scénario du §4 (clics répétés, changements d'échelle et de scrutin). Si un navigateur headless est disponible (Playwright), c'est la méthode utilisée pendant cette session — en interceptant `unpkg.com/leaflet@1.9.4` vers une copie locale de `node_modules/leaflet` si le réseau sortant de l'environnement bloque unpkg (comme dans cette session), pour ne pas confondre un vrai bug applicatif avec une simple restriction réseau de l'environnement de test.

## 8. Critères d'acceptation à ne pas régresser

- [ ] Le titre est exactement « Atlas électoral du Val-d'Oise ».
- [ ] Le lien « ← Retour à l'Atlas » pointe vers l'URL absolue `https://ddt95.github.io/atlas-territorial-95/`, jamais un chemin relatif.
- [ ] La carte se peuple à l'ouverture même si un CDN public (unpkg) est bloqué par le réseau — Leaflet est auto-hébergé en priorité (`public/vendor/leaflet/`, §0) ; ne pas repasser unpkg en source primaire sans re-résoudre ce risque réseau.
- [ ] Cliquer sur une commune ouvre toujours la synthèse avec les bonnes données — jamais un écran vide (§4).
- [ ] Changer de scrutin ne casse jamais le rendu de la carte.
- [ ] Le survol met en surbrillance et affiche la tendance (candidat/couleur) sans ouvrir la synthèse ; la sélection active reste visuellement distincte du survol.
- [ ] Aucune valeur de vote — ni aucune donnée administrative comme l'EPCI (§0) — n'est jamais affichée sans être réelle ; un scrutin/échelle incomplet affiche un badge « à compléter », jamais un chiffre ou un rattachement inventé.
- [ ] Aucun logo ou emblème de parti politique n'est utilisé — uniquement des couleurs et badges textuels de code de nuance.
- [ ] L'export GeoJSON et l'impression PDF fonctionnent depuis le tiroir de synthèse.
- [ ] `DATA.md` est mis à jour à chaque nouvelle donnée intégrée (source, méthode, couverture chiffrée).

## 9. Sources principales

Voir `DATA.md` pour le détail complet, source par source, avec URLs et méthode d'extraction. En résumé :

- Contours communes : [france-geojson](https://github.com/gregoiredavid/france-geojson) (Étalab/IGN)
- Contours bureaux de vote : INSEE/Etalab (méthode Voronoï), export fourni par l'utilisateur
- Résultats électoraux : [« Données des élections agrégées »](https://www.data.gouv.fr/datasets/donnees-des-elections-agregees) (data.gouv.fr, Tabular API) et exports officiels DGRC (Ministère de l'Intérieur) fournis directement par l'utilisateur pour plusieurs scrutins
- Population historique : INSEE, « Populations historiques »
- Socio-démographie (à compléter) : [« Profil sociodémographique des bureaux de vote »](https://www.data.gouv.fr/datasets/profil-sociodemographique-des-bureaux-de-vote-france-metropolitaine-insee-rp-2022-filosofi-2021) (INSEE RP 2022 / Filosofi 2021)

## 10. Contrainte d'environnement à connaître

La session de construction s'est déroulée dans un environnement dont le proxy réseau sortant bloque plusieurs domaines de data.gouv.fr (`static.data.gouv.fr`, `object.files.data.gouv.fr`) ainsi que `api.insee.fr` et `geo.api.gouv.fr` en direct — seule l'API Tabulaire de data.gouv.fr, accessible via un outil MCP dédié s'exécutant côté serveur, a pu être utilisée directement. Ce n'est **pas** une limitation de l'application elle-même : dans un environnement avec accès réseau standard, ces sources redeviennent atteignables normalement. Voir DATA.md §10 pour le détail complet.
