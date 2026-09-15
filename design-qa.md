# Design QA

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
- Post-fix evidence: the final in-app Browser capture shows the Atlas switch pattern, three-card portrait and unobstructed bottom actions.

## Remaining findings

No actionable P0, P1 or P2 mismatch remains. On short laptop viewports, the left panel scrolls to keep all controls and the legend accessible.

final result: passed
