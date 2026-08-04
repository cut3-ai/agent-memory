# Как проверять adaptive CBA experiment

Текущий честный эксперимент находится здесь:

```text
experiment-runs/a868eaf07b291644e0ff/
```

Старый `cba-runs/58181f6bb4630140f227` сохранён только как legacy snapshot. Его показатели `100/100` и `16156/16156` не являются доказательством: старый semantic harness вызывал универсальный stub вместо опубликованной composition. Не используйте этот run для оценки качества.

Исходный `workspaces.jsonl`, prompts, URL и private reconstruction programs в Git не входят.

## Порядок чтения

1. `experiment.json` — dataset/evaluator/split hashes и candidate implementation.
2. `split.json` — workspace-level train/validation/held-out split. Связанные exact-source workspaces не пересекают splits.
3. `evaluator-manifest.json` — замороженные файлы evaluator и перечень измеряемых/неизмеряемых свойств.
4. `rounds/00/metrics.json` — исходный baseline до двадцати улучшений.
5. `round-plan.json` — обязательные двадцать proposal rounds.
6. После прогонов: `rounds/01` … `rounds/20`, где должны лежать patch, tests, before/after metrics и deterministic decision.

## Baseline

По всему corpus:

```text
compositions:              100
semantic exact:             85
matched frames:          13468 / 16156
residual closures:         443
mined recipe coverage:       0
render errors:               0
```

Следовательно, baseline не принят для automatic memory promotion.

## Локальная проверка

```powershell
npm ci
npm test

node src/experiment/cli.js `
  --input C:\Users\User\Projects\cut3ai\workspaces.jsonl `
  --out experiment-runs
```

Оба evaluator runs должны давать одинаковый digest. Публичные artifacts не должны содержать raw composition source, prompts, transcripts или URL.

## Что ещё не доказано

- Нет Remotion/browser pixel comparison.
- Опубликованные generated factories ещё не исполняются independent verifier-ом.
- Все 443 visual formulas пока остаются closure wiring, а не closure-free memory Behaviours.
- `mined recipe coverage` равен нулю.

Именно уменьшение этих blockers без регрессии fidelity является целью следующих двадцати раундов.
