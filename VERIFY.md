# Как проверять Cut3 Agent Memory

Главный успешный experiment: `experiment-runs/5e3007173aa16b1d67c7/`.

Главный memory census: `memory-runs/79e052bffa80599b77ad/`.

Код сохранён не внутри JSON, а обычными tree-shakeable ESM-классами в `units/`, `behaviours/` и `core/`. `index.generated.json` — только навигация для агента, а `promotion-ledger.json` фиксирует допущенные ревизии и полное дерево их относительных зависимостей.

Исходный dataset, `.env`, prompts, transcript, URL и source композиций в Git и публичные run-артефакты не входят.

## Порядок чтения

1. `experiment-runs/5e3007173aa16b1d67c7/manifest.json` — binding, модели, число вызовов и границы доказательства.
2. `experiment-runs/5e3007173aa16b1d67c7/final-metrics.json` — выбранный профиль и метрики train/validation/heldout/full.
3. `experiment-runs/5e3007173aa16b1d67c7/rounds.json` — 20 решений Kimi и 4 ревью Claude. Receipt хранит только `candidateId`, provider/model, token usage и хеши; rationale отсутствует.
4. `experiment-runs/5e3007173aa16b1d67c7/checkpoint-chain.json` и `artifact-manifest.json` — 44 append-only phase checkpoint и хеши файлов.
5. `experiment-runs/5e3007173aa16b1d67c7/verification.json` и `privacy.json` — локальные library/tree-shaking/privacy проверки.
6. `index.generated.json` → `units/` и `behaviours/` — фактический переиспользуемый код.
7. `promotion-ledger.json` — какие точные module/dependency-closure ревизии опубликованы.
8. `memory-runs/79e052bffa80599b77ad/manifest.json`, затем `metrics.json` и `corpus.json` — независимый AST census без raw source.
9. `experiment-runs/attempt-audit.json` — успешный бюджет, прерванные attempts и отдельные schema smoke-вызовы.

## Архитектура CBA

Архитектура следует ключевому паттерну Norman the Necromancer: широкий плоский набор объектов, а изменяемое поведение вынесено в принадлежащие объектам Behaviour.

- `Unit` принимает уже созданный Unit, хранит дочерние Unit и Behaviour, но ничего не знает о React, Remotion, backend, runtime или factory.
- `Behaviour` принимает ровно один Unit в конструкторе. Владелец неизменяем; `attach()` и перенос Behaviour между Unit отсутствуют.
- Каждый конкретный класс объявляет собственный статический `kind`.
- `Opacity`, `Scale`, `Translate`, `Rotate`, `Blur`, `TextReveal` и `VisibleDuring` — отдельные классы с одним визуальным каналом. Комбинированного `fade+scale` класса нет.
- Числовые операции, clamp, перевод времени и interpolation не превращаются в Behaviour. Они представлены callback-free declarative Signals в `core/signals.js`.
- Произвольное число карточек или текстовых элементов собирается из `Group`, `Box`, `TextNode`, `Text` и Behaviour. Классов «ровно три карточки» или «последовательность subtitle cards» нет.
- React и Remotion — отдельные driver boundaries. Generic driver не импортирует ни одного конкретного Unit.
- Реестр dynamic import/factory отсутствует. Приложение пишет обычные static ESM imports; `sideEffects: false` позволяет bundler tree-shaking.
- Three.js ветка достижима только через явный импорт Three adapter; DOM/Remotion путь её сверху не тянет.
- `index.generated.json` содержит только `kind`, `type`, `source`, `export`. Runtime schemas, recipes и apps в индекс не встроены.

## Что делали 20 кругов

Это 20 адаптивных оценок профилей компилятора, а не 20 недоказуемых переписываний source моделью.

1. Из dataset берутся только composition tracks.
2. Split делается outcome-blind и по workspace-группам: train 63 композиции/6 workspaces, validation 19/2, heldout 18/2. Workspaces с одинаковым source не пересекают splits.
3. До платных вызовов all-feature профиль обязан пройти локальный preflight и сохранить fidelity.
4. На каждом круге Kimi `kimi-k2.6` видит ограниченный frontier из opaque ID, boolean feature flags и агрегированных счётчиков. Source, текст, URL и outcome отдельной композиции модель не получает.
5. Выбранный профиль локально компилируется и прогоняется по всем кадрам train и validation.
6. На кругах 5/10/15/20 `claude-sonnet-5` получает только агрегаты уже завершённого блока и рекомендует seed. Claude не может принять профиль.
7. Финальный выбор пересчитывается детерминированно и независимо от порядка среди измеренных профилей плюс заранее измеренного all-feature anchor.
8. Heldout открывается только после выбора.

Выбран `p_5f2b0753e250a125`: все публичные Unit lowering, collection lowering, primitive children, declarative Signal IR и отдельные opacity/scale/translate/rotate formulas включены; отдельный `opacityTween` выключен, потому что тот же случай уже покрывает более общий Signal IR.

## Результат experiment

| Метрика | Результат |
| --- | ---: |
| Composition cases | 100 |
| Проверено кадров | 16 156 |
| Render-tree matched | 16 156 / 16 156 |
| Compile/generated/render errors | 0 / 0 / 0 |
| Public-brick exact cases | 30 / 100 |
| Exact Native fallback cases | 58 / 100 |
| Unsupported Canvas/Three cases | 12 / 100 |
| Public Unit occurrences | 944 |
| Local atomic Behaviours | 276 |
| Native Units | 706 |
| Residual visual computations | 76 |

Baseline на train+validation имел 0 public-brick cases, 1 039 Native Units и 267 residual computations. Выбранный профиль получил 20 public-brick cases, снизил Native Units до 627 и residual computations до 68 без единого несовпавшего кадра.

Heldout: 10/18 public-brick exact, 7/18 exact Native fallback, 1 unsupported; 4 052/4 052 кадров совпали.

Ограничения результата:

- Сравнивается сгенерированное semantic render tree на каждом кадре, не браузерные пиксели. `pixelComparedFrames = 0`.
- 12 Canvas/Three композиций проходят контролируемый fallback, но не считаются exact CBA reconstruction.
- Heldout является process-heldout внутри уже известного development corpus, а не новым внешним unseen dataset.
- Поэтому нельзя писать «100% визуально воспроизведено чистыми кирпичами». Доказано 30% public-brick structural exact при полной frame-tree fidelity с fallback.

## Результат memory census

`memory-runs/79e052bffa80599b77ad/` подтверждает:

- 18 Unit и 7 Behaviour в публичном индексе;
- 923 unit witness, 430 atomic-behaviour witness и 369 visual sink;
- 0 cardinality-specific Unit, 0 combined Behaviour, 0 non-visual helper class;
- 38 числовых/non-visual helper declarations намеренно не стали классами;
- unit kind mapping coverage 44.8537%, behaviour kind mapping coverage 76.9767%; это navigation evidence, не reconstruction proof;
- 14 индексированных kind имеют свидетельства из нескольких workspaces;
- privacy findings: 0, модули при discovery не исполнялись.

`reconstructionProven=false` и `automaticPromotionAllowed=false` здесь корректны. Census не имеет права сам выдать human feedback и подписать production gates. One-to-one проверка конкретного generated candidate выполняется promotion-gate evaluator, а не статистикой kind mapping.

## Human feedback loop в production

Для каждой генерации используется точная связка `generated assistant event → candidate revision → module hash → dependency-closure hash → evidence hash`.

- Явный negative от пользователя сразу даёт `discard`; модель не вызывается и gates не могут переопределить отказ.
- Positive или neutral становится candidate только после минимум 30 секунд grace period и при отсутствии более позднего negative.
- Структурированный UI feedback является основным сигналом и не требует LLM.
- Если UI не дал структурированный сигнал, опциональный classifier получает только post-generation user messages в ограниченном окне: максимум 20 сообщений/8 000 символов, opaque IDs, с удалёнными URL, code blocks и secret-like tokens.
- Ответ classifier — только signal и opaque evidence IDs. Он не является authority для promotion; malformed/failed/ambiguous ответ отправляет candidate в quarantine.
- Перед append код заново читает repository с диска, чтобы shared dependency не могла измениться во время внешнего вызова.

Promotion требует пять подписанных gate receipts: `compilerFidelity`, `reconstruction`, `atomicity`, `privacy`, `module`. Все пять привязаны к одной ревизии candidate/module/dependency closure и одному evidence bundle.

API-ключи моделей не дают права подписывать gates. Для production нужны отдельные локальные секреты и разные authority:

```text
CUT3_MEMORY_GATE_HMAC_KEY
CUT3_MEMORY_GATE_AUTHORITY_ID
CUT3_MEMORY_EVIDENCE_HMAC_KEY
CUT3_MEMORY_EVIDENCE_AUTHORITY_ID
```

Один HMAC secret для final gate authority и evidence authority отвергается.

## API и фактический бюджет

Успешный experiment сделал ровно:

- Kimi: 20 calls, 22 660 input + 384 output = 23 044 tokens; cached input 1 109.
- Anthropic: 4 calls, 21 461 input + 179 output = 21 640 tokens.

Во время отладки были четыре закрытых без replay attempts и пять schema smoke calls. В `attempt-audit.json` учтены 44 вызова с usage receipts: 66 125 известных tokens. Ещё четыре вызова могли быть оплачены, но usage receipt не был надёжно сохранён: 1 Kimi и 3 Anthropic. Точную сумму биллинга подтверждает только console провайдера.

Kimi и Anthropic читаются из локального `.env`; поддерживаются в том числе имена `KIMI` и `Anthropic`. Значения ключей не попадают в stdout, receipts, package или Git.

Для `claude-sonnet-5` thinking явно выключен, а schema/tool names версионированы. Оба provider-контракта требуют ровно `{candidateId}`; extra fields, неизвестный ID, malformed JSON и неполный tool call отклоняются fail-closed.

## Воспроизведение

Локальные проверки без платных API:

```powershell
npm ci
npm test

node src/memory/cli.js `
  --input <dataset>/workspaces.jsonl `
  --out memory-runs `
  --repo .
```

Новый полный experiment делает 24 платных вызова и обязан иметь новый path-safe attempt ID:

```powershell
node src/experiment/profile-lab-cli.js `
  --input <dataset>/workspaces.jsonl `
  --output experiment-runs `
  --env <local-config>/.env `
  --repository . `
  --attempt-id <new-attempt-id> `
  --confirm-paid-calls RUN_20_KIMI_AND_4_ANTHROPIC_CALLS
```

Если в `.profile-lab-progress/<binding>/provider-inflight.json` остался intent без соответствующего checkpoint, удалять его и повторять вызов нельзя: запрос мог быть принят и оплачен. Такой attempt закрывается или вручную сверяется с provider billing. Новый прогон запускается с новым `--attempt-id`; старые bytes не изменяются.

README намеренно отсутствует. Единственная инструкция по проверке — этот файл.
