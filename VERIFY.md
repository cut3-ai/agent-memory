# Как проверять Cut3 Agent Memory

README намеренно отсутствует. Этот файл описывает production-архитектуру версии `0.5.0` и отдельно помечает старые dataset-прогоны как lab.

## Что теперь является production

Production-память работает на одной точной ревизии сгенерированного кода в реальном времени. Большой dataset, 20-round search и присутствие человека не являются обязательными частями этого пути.

```text
core/ + units/ + behaviours/       foundation-механика и render drivers
units/composition-pivot.js          абсолютная точка трансформации композиции
units/vector-path.js                числовая renderer-neutral грамматика рисовки
src/feedback/outcome.js            pure reducer событий одной revision
src/feedback/online-observer.js    durable online coordinator + late feedback
src/memory/style-contract.js       non-thin проверка стилистического класса
src/memory/retrieval.js            deterministic retrieval по exact scent cues
src/memory/agent-contract.js       стабильная инструкция генератору
src/memory/privacy/                lightweight metadata policy + font catalog
src/memory/promotion.js            единственная write-orchestration
src/library/                       static discovery, ledger и единый индекс
index.generated.json               навигация для агента
promotion-ledger.json              content-addressed trust boundary
```

Ни одно production-дерево (`src`, `core`, `units`, `behaviours`) не импортирует `lab`. Это проверяет `test/topology.test.js`. Dataset census, model search, старый miner, gates experiment и их тесты находятся только в `lab/` и не входят в npm package.

## Online feedback без обязательного человека

Каждое событие содержит `revisionSha256` и не содержит prompt, source, URL, transcript или workspace ID. Reducer принимает три типа событий:

- `generation` — начало жизни immutable revision;
- `validation` — отдельные compile и render receipts;
- `workspace-action` — структурированный результат использования revision.

Решение вычисляется детерминированно:

| Событие | Сигнал |
| --- | --- |
| `accepted`, `reused` | positive |
| `exported`, `continued-unchanged` | neutral |
| `corrected`, `regenerated`, `manual-edit`, `reverted`, `deleted` | negative |
| compile или render failure | discard |
| `topic-changed`, `previewed`, `autosaved`, `session-closed`, тишина | никакого одобрения |

Negative имеет абсолютный приоритет. Positive/neutral допускаются только после успешных compile + render и 30-секундного grace period. Без квалифицированного outcome revision остаётся pending/quarantine и не попадает в GitHub.

`outcomeEvents` являются доверенным server-side входом: их должен создавать backend из фактических действий workspace. Клиент не должен иметь возможность прислать произвольный `accepted`/`exported`. Готовые feedback receipts orchestration не принимает; если события когда-либо пройдут через недоверенную очередь или внешний API, поверх них потребуется отдельная подпись outcome-authority.

Пример полностью без диалога покрыт тестом `qualified workspace export promotes without dialogue or a model` в `test/memory-promotion.test.js`: `exported` создаёт neutral receipt, проходит gates и записывается в ledger с authority `workspace-outcome`.

### OnlineMemoryObserver: ожидание, рестарт и поздний negative

`OnlineMemoryObserver` экспортируется из `@cut3/agent-memory/memory/online-observer`. Он не вызывает LLM и не ждёт человека. Backend передаёт ему только доверенные server-side revision events. Сам `candidateSha256` нельзя назначить аргументом запроса: обязательный инжектируемый `resolveCandidate({revisionSha256})` должен достать его из durable content-addressed staging и вернуть exact binding receipt `{schemaVersion, revisionSha256, candidateSha256, bindingReceiptSha256}`. Caller может передать `candidateSha256` только как ожидаемое значение для fail-closed сверки. Binding сохраняется в CAS-record и повторно проверяется непосредственно перед quarantine и commit; callback также получает `candidateBindingReceiptSha256`.

Observer сам восстанавливает grace/window timers через `resume()` после рестарта. Внешние операции лежат в durable outbox, получают стабильный `operationId`, lease и retry. Lease-watchdog ставится **до** ожидания внешнего callback: зависший Promise не блокирует повторный захват тем же или другим worker. Поэтому `resolveCandidate` и side-effect callbacks обязаны быть идемпотентными; callbacks — по `operationId`.

Durable event record является семантической проекцией, а не transcript кликов: повторные `previewed`/`autosaved` compact-ятся, для compile/render остаётся эффективная latest validation, для каждого outcome signal — достаточное earliest/latest evidence. Terminal negative всегда сохраняется и не может быть вытеснен лимитом в 200 событий. `onError` получает только стабильный `errorCode` и `errorSha256`; message, stack, URL, prompt и source ему не передаются.

Publication намеренно двухфазная:

```text
pending outcome
  → candidate
  → promoteCandidate()       только reversible quarantine, не public push
  → publication hold         по умолчанию ещё 10 минут после quarantine
  → повторная проверка exact revision
  → commitCandidate()        необратимая публикация
```

До начала commit новый negative гарантированно вызывает `cancelCandidate()`. Если negative приходит во время уже запущенного commit или после него, observer вызывает обязательный `revokeCandidate()`. Этот callback должен добавить deprecation/revert/tombstone и вернуть `tombstoneSha256`. Он не удаляет Git history и observer нигде не утверждает обратное. Callback API намеренно не содержит операции erase/delete-history.

`createInMemoryOnlineMemoryStore()` является только reference store для тестов и однопроцессных инструментов; production должен инжектировать durable database CAS. Текущий модуль готов к подключению backend, но в `cut3ai` в этой ревизии ещё не интегрирован.

Kimi нужен только как опциональный классификатор явной реакции в свободном тексте. Смена темы, продолжение разговора или отсутствие возражения моделью больше не трактуются как neutral. Provider не подписывает gates и не может самостоятельно сохранить память. Anthropic для online feedback loop не требуется.

## Что именно сохраняется

`Text`, `Image`, `Box`, `Opacity`, `Scale` и подобные классы являются foundation vocabulary. Они могут быть низкоуровневыми, но всегда имеют role `infrastructure` и сами по себе не являются памятью.

Доменная модель следует паттерну Component–Behaviour–Attributes из статьи [Norman the Necromancer](https://danthedev.com/norman-the-necromancer/), но адаптирует его к renderer-neutral видео-дереву и static ESM.

Память — конкретный direct subclass, проходящий `style-memory-v3`:

- Unit принимает один смысловой Unit-слот и строит вокруг него ветвящееся дерево минимум из пяти внутренних Unit, глубиной не меньше четырёх;
- каждый внутренний Unit имеет ровно одного родителя, а смысловой slot встречается в дереве ровно один раз;
- Unit фиксирует собственные решения по пяти осям: composition (≥4), typography (≥3), palette (≥2), rendering (≥2) и motion;
- motion должен ссылаться на authored style Behaviour, а не просто на generic `Opacity`, `Scale`, `Translate` и другие foundation wrappers;
- Behaviour принимает только owner Unit, подключается как `owner.add(new Behaviour(owner))`, пишет один конкретный визуальный канал и содержит собственный нелинейный frame-law;
- transform/filter пишутся только через канонические `writeTransform`/`writeFilter`; прямые `this.unit.scale`, `timer`, `transform` и мёртвая математика отклоняются;
- authored Behaviour с каналом `transform:*` может принадлежать только прямому `CompositionPivot`, поэтому scale/rotate нельзя незаметно вернуть к локальному CSS pivot;
- параметры `style`, `appearance`, `props`, `value`, `signal`, `callback`, renderer/backend/factory и dynamic imports запрещены;
- прямые imports внешних библиотек запрещены: тяжёлая реализация остаётся за foundation Unit и попадает в bundle только через выбранный static ESM import;
- авторская рисовка задаётся листьями `VectorPath` из закрытого массива числовых `move/line/curve/arc/close`-сегментов. Opaque SVG path string, текст, URL и drawing callback не представимы этой grammar; geometry и stroke constants входят в fingerprint;
- CSS defaults/no-op (`transparent`, `none`, `auto`, `normal`, `static`, нули и пустые строки) не считаются авторскими решениями; повтор одного CSS-ключа также не увеличивает покрытие;
- из реального дерева, конкретных значений и frame-law детерминированно строится evidence fingerprint; любое изменение структуры или визуальной константы меняет его;
- каждый scent cue обязан точно совпасть с descriptor, выведенным из source. Произвольная самодекларация вроде `signal-blue` поверх красной палитры отклоняется.

Пивот задаётся только foundation-классом `CompositionPivot(unit, {x, y})`, где `x/y` — абсолютные координаты композиции. Его adapter использует rig `(x,y) → (-x,-y)`, поэтому Rotate/Scale удерживают выбранную точку на месте. CSS `transformOrigin` и transform-Behaviour на обычном `Box` не считаются пивотом памяти и отклоняются контрактом.

Поэтому класс с другим именем вокруг CSS property, `spring()`, `interpolate()`, Three.js import или callback не проходит `style-contract`, даже если у него есть красивое описание.

Читаемый положительный и отрицательные примеры находятся в `test/style-contract.test.js`. Тест доказывает ветвящееся дерево с `CompositionPivot`, пять style axes, authored Behaviour, authored vector subtree и отказы для CSS wrapper, мёртвого frame-кода, metadata-подделки, двух родителей, external library и generic animation. Runtime-грамматику и общий React/Remotion adapter отдельно проверяет `test/vector-path.test.js`.

## Scent — «аромат» для агента

Каждый memory-класс обязан держать controlled metadata прямо в source:

```js
static scent = Object.freeze({
  family: 'signal-editorial',
  composition: ['asymmetric-stack', 'edge-anchored'],
  typography: ['condensed-uppercase', 'oversized-copy'],
  palette: ['ink-black', 'paper-white', 'signal-red'],
  rendering: ['hard-shadow', 'paper-grain'],
  motion: ['two-beat-snap'],
});
```

`family` собирается максимум из трёх атомов закрытого privacy-safe словаря (`editorial`, `signal`, `cinematic` и т. п.), а не из имени клиента или текста запроса. Остальные cues — только lowercase kebab-case tokens, точно подтверждённые derived evidence из source; raw prose, prompt, URL и произвольные поля запрещены. Derived evidence различает, среди прочего, exact public font (`font-anton`), literal palette (`color-ff3b30`) и hash конкретной vector geometry. Разрешённые font families находятся в versioned static ESM-каталоге из 41 публичной семьи; runtime-регистрации и дополнительного JSON нет. У standalone Behaviour четыре немоушн-оси пусты, а `motion` содержит его доказанную грамматику. `index.generated.json` версии 3 копирует `scent` только для role `memory`. Отдельного scent JSON, recipe JSON, app JSON или subjective score metadata нет.

Работа агента:

1. вызвать `retrieveStyleMemories(index, requestedScent)` над одним `index.generated.json`; результат сортируется детерминированно и показывает точные `matched`/`missing` cues без модельного score;
2. если память подходит — импортировать только этот класс обычным static ESM import;
3. менять смысловой child/content, сохраняя визуальные константы, дерево и temporal law;
4. если подходящего класса нет — сгенерировать composition, дождаться qualified workspace outcome и только затем предложить новый style-memory candidate;
5. сохранить «как сделал бы тот же дизайнер», а не копию той же сцены.

Стабильная инструкция экспортируется как `styleMemoryAgentInstruction()` из `@cut3/agent-memory/memory/agent-contract`.

## Promotion

`orchestrateMemoryPromotion()` — единственная production-функция, которая может подготовить ledger/module write. Перед записью она связывает:

```text
candidate revision
  → generated revision
  → compile + render receipt
  → qualified outcome receipt
  → ordered atomic bundle (Unit + новые authored Behaviours)
  → exact modules + dependency closures
  → six signed gates
  → promotion ledger
```

Один успешный revision может сохранить Unit и необходимые ему новые authored Behaviours одной транзакцией. Упорядоченный состав bundle, hash каждого модуля и его dependency closure входят в `bundleSha256`, который связан с outcome и всеми gate receipts. Нельзя подписать один Unit, а затем незаметно добавить generic `Scale`, thin Behaviour или другой файл. Перед записью проверяется весь будущий public graph, поэтому новая revision общего Behaviour не может оставить уже сохранённый reverse-dependent Unit со старым closure. Materialization сначала preflight-проверяет все файлы и при любой ошибке восстанавливает все прежние module/ledger bytes.

Параллельные writers сериализуются atomic `*.promotion.lock`. Уже под lock materializer заново читает disk ledger и сравнивает exact base `ledgerSha256`; только один job от одной base revision может commit, остальные получают stale/locked failure и обязаны пересобрать decision. Lock удерживается через commit и rollback, поэтому stale rollback не может стереть соседний success. После process crash lock намеренно не захватывается автоматически: до ручной проверки transaction state новый write fail-closed.

Шесть gates остаются обязательными: compiler fidelity, reconstruction, atomicity, authenticity, privacy и module/static-ESM. Дополнительно staged source всегда проходит новый `style-contract`; подписанный «authenticity=true» не может протащить thin wrapper мимо него. Built-in privacy-проверка независимо сканирует bytes всего closure и AST staged-файлов: semantic literals, comments, quoted/computed string keys, URL, email, host, secrets и произвольный текст в CSS-полях отклоняются. Визуальные строки проходят только через ограниченные property-specific грамматики для catalog fonts, цветов, градиентов, border/shadow и других поддержанных свойств; подписанный `privacy=true` это не обходит. Hash/JSON decision path импортирует только lightweight `privacy/artifact.js` и не тянет Babel parser.

Для настоящего promotion нужны отдельные локальные authorities:

```text
CUT3_MEMORY_GATE_HMAC_KEY
CUT3_MEMORY_GATE_AUTHORITY_ID
CUT3_MEMORY_EVIDENCE_HMAC_KEY
CUT3_MEMORY_EVIDENCE_AUTHORITY_ID
```

Provider API keys не заменяют эти authorities. Secrets не коммитятся и не выводятся в receipts.

## JSON и offline lab

У production две JSON-роли:

- `index.generated.json` — маленькая навигация для агента;
- `promotion-ledger.json` — hash-sealed история доверенных exact revisions.

Все старые tracked run-директории удалены из текущего дерева. Их компактный итог находится в одном `lab/artifacts/offline-runs.json`; полные данные доступны через Git history. Новые lab runs по умолчанию идут в ignored `lab/runs/{census,experiment,legacy}`.

Архив честно фиксирует, что прежние 20 кругов выбирали compiler profile, а не обучали online memory; последний dataset census нашёл пять гипотез, но не emitted ни одного класса и не доказал reconstruction. Эти числа больше не представлены как production coverage.

## Текущее содержимое библиотеки

Корневой индекс содержит 27 foundation entries с role `infrastructure` (включая `unit.composition-pivot` и `unit.vector-path`) и 0 entries с role `memory`. Это намеренно: новый контракт не объявляет старые CSS-like primitives или сам `VectorPath` сохранённым стилем и не фабрикует memory code без успешной online revision.

## Проверка

Команды не делают платных provider-вызовов:

```powershell
npm ci
npm test
npm pack --dry-run --json

node --input-type=module -e "import { generateNavigationIndex } from './src/library/index.js'; await generateNavigationIndex({rootDir: process.cwd()})"
```

Дополнительно полезны:

```powershell
npm run test:production
npm run test:lab
git diff --check
```

Ожидаемые свойства:

- production → lab imports: 0;
- `orchestrateMemoryPromotion` implementations: 1;
- npm tarball не содержит `lab/**`;
- index version: 3;
- index roles: 27 infrastructure, 0 memory;
- text-only bundle не тянет Three/canvas/unused adapters;
- VectorPath bundle не тянет SVG/canvas/Three adapters, а feedback decision bundle — Babel/style scanner;
- provider modules не образуют barrel import-cycle;
- silence/topic change не создают neutral receipt;
- workspace export может дать neutral без LLM только после compile + render + grace;
- thin Unit/Behaviour и external-library wrapper отклоняются до ledger write;
- Unit + новые authored Behaviours сохраняются только одним hash-bound atomic bundle;
- изменение общего Behaviour без переутверждения reverse-dependent memory отклоняется;
- две promotion от одной ledger revision не могут обе commit или откатить результат друг друга;
- raw content нельзя спрятать в `fontFamily`, gradient, color, border или другом style literal.

Composer здесь намеренно не изменён. Для будущей интеграции backend должен передать immutable `revisionSha256`, generation event, два validation receipts и реальные workspace actions, а также инжектировать durable CAS store, trusted `resolveCandidate` и идемпотентные quarantine/commit/cancel/revoke callbacks. Сырые prompts/transcripts в этот репозиторий передавать нельзя. Эта ревизия даёт проверяемый integration contract, но не выдаёт его за уже подключённый end-to-end production flow.
