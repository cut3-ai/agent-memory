# cut3 agent memory — CBA reconstruction lab

Это лаборатория lossless-компиляции Cut3 compositions в архитектуру Component–Behaviour–App (CBA). Она читает `workspaces.jsonl`, берёт только `tracks.filter(track => track.type === 'composition')`, строит исполняемые `Unit`/`Behaviour`-модули и собирает каждую исходную composition обратно.

Текущий результат — локальный эксперимент. Он ничего не публикует в GitHub и не разрешает automatic memory promotion, пока не пройдены все hard gates.

## Контракт CBA

Архитектура следует паттерну из [Norman the Necromancer](https://danthedev.com/norman-the-necromancer/): factory создаёт объект, а независимые behaviours добавляют ему поведение.

```js
const card = createCardUnit({ text, image });
card.add(
  createOpacityBehaviour({ from: 0, to: 1 }),
  createScaleBehaviour({ from: 0.9, to: 1 }),
  createBadgeUnit({ label }),
);
```

В этой реализации:

- `Unit` — исполняемый render object с `type`, `props`, дочерними Units и Behaviours;
- `Behaviour` — frame-pure изменение одного visual channel;
- `Unit.add()` принимает Behaviour или другой Unit;
- `Opacity`, `Scale`, `Translate` и `Rotate` — разные classes/factories;
- `clamp`, `lerp`, `msToFrames` и прочая арифметика не являются memory entries;
- `Repeat Unit` принимает любое количество элементов, поэтому две и десять карточек используют один и тот же кирпич;
- `Switch Unit` представляет conditional rendering без создания модуля под целую сцену;
- Remotion driver является основным, React driver — fallback.

Remotion может запросить кадры в произвольном порядке, поэтому Behaviour вычисляется от текущего render context и не накапливает `dt`.

## Структура

```text
core/
  Unit.js
  Behaviour.js
  runtime.js
  drivers/
    remotion.js
    react.js

src/cba/
  compiler.js
  semantic-harness.js
  catalog.js
  evaluate.js
  pipeline.js
  cli.js

cba-runs/<runId>/                 # sanitized, Git-ignored experiment output
  units/<backend>/<name>.js
  behaviours/<channel>/<name>.js
  index.generated.json
  index.generated.js
  evaluation/
  report.md

.private-cba-runs/<runId>/        # raw source/data, always private
  reconstructions/<composition>/program.js
```

Категории `units/<backend>/` и `behaviours/<channel>/` нужны только для навигации и lazy loading. Это не semantic identity и не причина создавать новый тип. DOM-only reconstruction импортирует только свои factories; Three factories остаются за отдельными dynamic imports.

`recipes/`, `apps/` и production JSON schemas в этот прототип не входят. App — продуктовый слой studio/workspace, а не memory primitive. Старый `schemas/` относится только к legacy discovery miner.

## Что делает компилятор

1. Находит reachable closure от `GeneratedComposition`; JSX из неиспользуемых helpers не попадает в library и не тянет Three.js.
2. На untouched AST независимо считает Unit origins и frame-driven visual sinks.
3. Понижает каждый JSX/`React.createElement` boundary в factory call.
4. Понижает `.map()` в `Repeat Unit`, conditional JSX — в `Switch Unit`.
5. Прикрепляет atomic Behaviours к конкретным props/children; combined transform разбивается по операциям и снова собирается в исходном порядке.
6. Классифицирует frame effects по dataflow: Canvas draw, Three mutation или обычный lifecycle.
7. Генерирует reconstruction с direct imports только фактически используемых factories и включает strict runtime: unresolved factory является ошибкой, fallback запрещён.
8. Обратно снимает instrumentation и требует exact AST equality.
9. Линкует реальные generated modules и валидирует, что factory действительно возвращает Unit/Behaviour.
10. Сравнивает исходное и CBA render tree на каждом integer frame, включая ordered Canvas/effect traces.

Public artifacts не содержат raw source, prompt, transcript, пользовательский text или URL. Они остаются только в `.private-cba-runs/`.

## 20 проходов

Pipeline фиксирован до запуска и последовательно проверяет:

1. corpus lock;
2. parse/reachability;
3. instrumentation reversal;
4. JSX-lowering reversal;
5. origin accounting;
6. generated-module link;
7. Unit materialization;
8. frame dataflow;
9. Behaviour atomicity;
10. dynamic content/controls;
11. loops/collections;
12. Remotion timeline/media;
13. local components/hooks;
14. lifecycle/resources;
15. SVG;
16. Three;
17. Canvas;
18. exact factory folding;
19. typed anti-unification/leave-one-workspace-out;
20. frozen deterministic replay and release gate.

Никакой GPT, live author feedback или `confidence` не участвует в production extraction. Human feedback позже сможет только разрешить/запретить promotion уже автоматически проверенного кода.

## Запуск

Требуется Node.js 22+.

```powershell
cd C:\Users\User\Projects\cut3-agent-memory
npm install
npm test
npm run cba -- --input C:\Users\User\Projects\cut3ai\workspaces.jsonl --cycles 20
```

Legacy taxonomy miner оставлен только для сравнения:

```powershell
npm run mine:legacy -- --input C:\Users\User\Projects\cut3ai\workspaces.jsonl
```

## Текущий corpus result

Контрольный dataset содержит 100 compositions и 16 156 timeline frames.

- exact source/lowered AST round-trip: 100/100;
- semantic render-tree match: 16 156/16 156 frames, 100/100 compositions;
- renderer coverage: DOM, SVG, Canvas2D и Three;
- structure: 912 Unit occurrences → 16 executable factories;
- controls: 57 Repeat Units и 52 Switch Units;
- animation: 443 visual sinks → 509 atomic Behaviour occurrences → 11 factories;
- unresolved factories, fallback behaviours и orphan behaviours: 0;
- public raw URL/source leaks: 0;
- regression tests: 63/63.

Это ещё не production 1:1. Release gate остаётся закрыт по двум причинам:

1. не выполнен настоящий Remotion/browser pixel diff;
2. формулы visual sinks пока передаются из private reconstruction как expression wiring. Они воспроизводимы, но ещё не превращены в closure-free shared animation configs с честным purged leave-one-workspace-out coverage.

Поэтому semantic 100% не маскируется под готовую memory: `acceptedForAutomaticMemoryPromotion` остаётся `false`.

## Promotion policy

Entry можно сохранить в GitHub memory только если одновременно:

1. factory executable и принадлежит одному Unit или одному Behaviour channel;
2. text, URL, media, color и timing вынесены в inputs/config;
3. dependency closure известен, imports линкуются, strict runtime не использует fallback;
4. reconstruction совпадает на всех semantic frames и critical pixel frames;
5. Behaviour прикреплён к Unit и реально формирует output;
6. purged leave-one-workspace-out подтверждает reuse, а не только core primitive availability;
7. negative human signal запрещает promotion; positive/neutral лишь открывает его после автоматических gates.
