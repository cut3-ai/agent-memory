# CBA reconstruction evaluation

Run: `58181f6bb4630140f227`

## Outcome

- Exact reversible AST transforms: 100/100.
- Exact semantic frame trees: 100/100 compositions and 16156/16156 frames.
- Generated modules linked: 100/100.
- Unit occurrences folded into factories: 912 → 16.
- Atomic Behaviour occurrences folded into factories: 509 → 11.
- Production 1:1 accepted: no.

The semantic result is deliberately not labelled pixel-exact. Formula closures remain private reconstruction wiring and are not promoted as reusable mined recipes.

## 20 passes

| # | Pass | Brick coverage | Structural complete | Semantic exact |
|---:|---|---:|---:|---:|
| 1 | corpus-lock | 0.00% | 0 | 0 |
| 2 | parse-and-reachability | 0.00% | 0 | 0 |
| 3 | instrumentation-reversal | 0.00% | 0 | 0 |
| 4 | jsx-lowering-reversal | 0.00% | 0 | 0 |
| 5 | independent-origin-accounting | 0.00% | 0 | 0 |
| 6 | generated-module-link | 0.00% | 0 | 0 |
| 7 | unit-materialization | 25.76% | 0 | 0 |
| 8 | frame-dataflow | 35.47% | 0 | 0 |
| 9 | behaviour-atomicity | 44.05% | 0 | 0 |
| 10 | dynamic-content-and-controls | 62.14% | 0 | 0 |
| 11 | loops-and-collections | 66.15% | 0 | 0 |
| 12 | remotion-timeline-and-media | 82.20% | 69 | 0 |
| 13 | local-components-and-hooks | 83.60% | 76 | 0 |
| 14 | lifecycle-and-resources | 83.60% | 76 | 0 |
| 15 | svg | 92.82% | 88 | 0 |
| 16 | three | 99.01% | 93 | 0 |
| 17 | canvas | 100.00% | 100 | 0 |
| 18 | exact-factory-deduplication | 100.00% | 100 | 0 |
| 19 | typed-anti-unification-and-loo | 100.00% | 100 | 0 |
| 20 | frozen-release-evaluation | 100.00% | 100 | 100 |

## Generated library

- 16 executable Unit modules.
- 11 executable Behaviour modules.
- `index.generated.js` contains lazy dynamic imports; a reconstruction imports only factories it uses, so Three.js factories are not pulled into DOM-only compositions.
- Raw URLs, user text and transcript/source code exist only under the private reconstruction root.

## Remaining hard gates

- Pixel-level Remotion comparison has not been executed.
- Visual formulas are still wired by private expression closures; shared closure-free mined recipes are not yet proven.
