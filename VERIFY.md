# Как проверить CBA pipeline run

В ветке зафиксирован санитизированный результат `cba-lossless-v0.3.1`:

```text
cba-runs/58181f6bb4630140f227/
```

Private reconstruction programs и исходный `workspaces.jsonl` намеренно не входят в Git: они содержат пользовательский source, text и URL.

## В каком порядке читать

1. `cba-runs/58181f6bb4630140f227/report.md` — короткий итог и таблица 20 проходов.
2. `cba-runs/58181f6bb4630140f227/evaluation/final.json` — точные итоговые метрики и release verdict.
3. `cba-runs/58181f6bb4630140f227/index.generated.json` — навигация: какие Unit/Behaviour factories были созданы, где лежит код и сколько раз factory использовалась.
4. `cba-runs/58181f6bb4630140f227/units/` — исполняемый код Unit factories.
5. `cba-runs/58181f6bb4630140f227/behaviours/` — исполняемый код Behaviour factories.
6. `core/Unit.js`, `core/Behaviour.js`, `core/runtime.js` — контракт исполнения и attachment Behaviours к Units.
7. `src/cba/compiler.js` и `src/cba/semantic-harness.js` — lowering исходной composition и all-frame verifier.

`index.generated.json` не содержит кода: он является индексом. Поле `module` ведёт к соответствующему `.js`-файлу.

## Быстрая проверка

```powershell
npm ci
npm test

$run = Get-Content cba-runs/58181f6bb4630140f227/evaluation/final.json -Raw | ConvertFrom-Json
$run.semanticExactCompositions
$run.semanticFrames
$run.deterministicReplay
$run.generatedFactoryValidation
```

Ожидаемый результат:

- tests: `63/63`;
- semantic compositions: `100/100`;
- semantic frames: `16156/16156`;
- 20 replay cycles имеют одинаковый digest;
- generated modules linked: `100/100`;
- orphan, pending и fallback behaviours: `0`;
- Canvas/effect trace mismatches: `0`;
- generated Unit/Behaviour factory validation: `valid: true`.

Проверка, что public run не содержит raw URL или composition source:

```powershell
Get-Content cba-runs/58181f6bb4630140f227/evaluation/privacy.json
rg -n "https?://|GeneratedComposition\s*=|cdn\.cut3" cba-runs/58181f6bb4630140f227
```

`privacy.json` должен содержать `rawUrls: 0` и `sourceMarkers: 0`; `rg` не должен найти совпадений.

## Как проверить tree-shaking

Откройте `index.generated.js`: каждая factory находится за отдельным `import()`. Three-модули лежат только в `units/three/` и `behaviours/three/`; DOM factories их не импортируют.

## Как воспроизвести run локально

Dataset не коммитится. Если `workspaces.jsonl` расположен рядом с `cut3ai`, запустите:

```powershell
npm run cba -- --input C:\Users\User\Projects\cut3ai\workspaces.jsonl --cycles 20
```

Ожидаемый run ID: `58181f6bb4630140f227`. Каждый replay cycle должен получить digest `f5a6d7eac3782531870537d691f8b288553677359f37a995d7ec026092b3a4c9`.

## Что результат пока не доказывает

`acceptedForAutomaticMemoryPromotion` намеренно равен `false`.

- Не выполнен настоящий Remotion/browser pixel diff.
- 443 visual formulas ещё находятся в private reconstruction wiring и не стали closure-free shared animation configs.
- Поэтому `minedRecipeLeaveOneWorkspaceOut.coverage` равен `0`; доступность базовых renderer factories не выдаётся за качество mined memory.

Ветка подходит для ревью CBA compiler/runtime и воспроизводимости pipeline, но пока не является готовой production memory library.
