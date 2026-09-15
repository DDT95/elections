# Design QA

## 15 septembre 2026 — volet de synthèse communal

- [x] Ordre de lecture : profil, participation, résultats, évolution, sensibilités.
- [x] Premiers tours retirés hors présidentielles ; dernier tour disponible utilisé.
- [x] Résultats limités aux quatre premiers et regroupés par élection.
- [x] Couleur distincte par scrutin et échelle des barres de score fixée à 0–100 %.
- [x] Libellé du scrutin visible sous chaque valeur d’évolution.
- [x] Fiche PDF A4 reprenant les cinq blocs, les sources et les précautions de lecture.
- [x] Actions d’impression et d’export maintenues en bas du volet.
- [x] Construction GitHub et dix tests de cohérence des données validés.

- Source visual truth: `/var/folders/3h/px_6bwl96w50x8y34bkz_k_80000gn/T/TemporaryItems/NSIRD_screencaptureui_xYSZXd/Capture d’écran 2026-09-15 à 12.28.51.png`
- Source pixels: 2730 × 1966, browser chrome excluded from the visual comparison.
- Implementation: `http://127.0.0.1:5173/?review=switches`
- Browser evidence: Codex in-app Browser inline capture, 1430 × 720 CSS viewport at device scale 1.
- State: Présidentielle 2022, second tour, commune, candidat arrivé en tête, Cergy.

## Full-view comparison

The implementation follows the source composition: State identity header, rounded left control panel, neutral full-height map, highlighted territory, two upper portrait cards, a centered territory label, and one wider lower card. The results use the existing election data and preserve the source hierarchy.

## Focused comparison

- Controls: replaced segmented buttons with the Atlas switch pattern: switch, title, description, active color.
- Typography: Marianne, navy headings, compact grey supporting text and strong numeric hierarchy match the source.
- Spacing: panel/card radii, internal padding and the three-card orbit follow the source proportions.
- Colors: navy brand, amber result, purple participation and turquoise electorate accents create clear semantic grouping. The cartographic legend remains tied to the selected indicator.
- Assets: the official Préfet du Val-d’Oise logo is reused from the project at native quality; no placeholder imagery is present.
- Copy: labels describe the electoral meaning of each value; print and export actions are at the bottom of the detailed sheet.

## Interaction checks

- Scale switches: commune → bureau de vote → commune passed.
- Election and tour selectors render and retain data-driven options.
- Hover portrait and click-to-open handlers are connected to every mapped feature.
- Browser console: no errors or warnings.

## Comparison history

- P1: segmented controls differed from the Atlas charter. Fixed by implementing switch rows with labels and descriptions.
- P1: the map offered only a small tooltip. Fixed with three persistent portrait cards driven by the hovered territory.
- P2: print and export appeared before the content. Fixed by moving both actions below the detailed results.
- P1: candidate bars were normalized against the leading candidate, making 32.83% appear as a full bar. Fixed with an absolute 0–100% scale.
- P1: fixed percentage bounds flattened some elections into a single dark color. Fixed with data-driven bounds and continuous color interpolation.
- P1: the INSEE section exposed an internal completion message. Fixed by aggregating the available INSEE RP 2022 bureau context into commune profiles and rendering the indicators directly.
- P1: three large cards followed the map hover and obscured the territory. Fixed by restoring a compact hover label and reserving the detailed synthesis for the click-opened right drawer.
- P1: political evolution only tracked RN, LFI and a combined left total. Fixed with a five-sensitivity stacked history and seven colored political-family trends across comparable first rounds.
- P1: a commune click exposed only the active election. Fixed with the top four results and participation for all 13 available election rounds.
- Post-fix evidence: the final in-app Browser capture shows the Atlas switch pattern, three-card portrait and unobstructed bottom actions.

## Remaining findings

No actionable P0, P1 or P2 mismatch remains. On short laptop viewports, the left panel scrolls to keep all controls and the legend accessible.

final result: passed
