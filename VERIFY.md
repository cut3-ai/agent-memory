# Как проверять Cut3 Agent Memory

Этот файл — единственная каноническая инструкция репозитория. README намеренно отсутствует.

Текущий авторитетный результат находится в `memory-runs/a28da6b6089b3ee5a83d/`. Это детерминированный AST census алгоритма `class-memory-v6-stylistic-subtree` с ruleset `stylistic-subtree-memory-census-v6`, а не заявление о том, что библиотека памяти уже наполнена готовыми классами.

## Короткий итог

На текущей ревизии есть:

- 25 проверенных foundation-записей: 18 Unit и 7 Behaviour с `role: "infrastructure"`;
- 5 найденных stylistic candidates: 1 Unit и 4 Behaviour;
- 2 `evidenceReady` candidates;
- 0 сгенерированных, реконструированных или promoted классов с `role: "memory"`.

Поэтому `candidate != code != memory`:

- candidate — только хешированная гипотеза о переиспользуемом стилистическом мотиве;
- code — реальный статический ESM-класс в `units/` или `behaviours/`;
- memory — такой класс только после reconstruction, human feedback, шести подписанных gates и записи в `promotion-ledger.json` с `role: "memory"`.

Сейчас реальный код в `units/`, `behaviours/` и `core/` является foundation vocabulary. Классов памяти в репозитории пока нет. `index.generated.json` — навигация, а не контейнер с кодом, schemas, recipes или apps.

## Как читать текущий run

Читайте файлы в таком порядке:

1. `memory-runs/a28da6b6089b3ee5a83d/manifest.json` — версия алгоритма, хеши, границы доказательства и главные счётчики.
2. `memory-runs/a28da6b6089b3ee5a83d/corpus.json` — агрегированный census schema 6 и `memoryCandidates`; raw source, текст, URL и assets здесь отсутствуют.
3. `memory-runs/a28da6b6089b3ee5a83d/metrics.json` — mapping scope `stylistic-candidates-to-indexed-memory`, residuals и причины недоказанного reconstruction.
4. `memory-runs/a28da6b6089b3ee5a83d/index.snapshot.json` — точный navigation index, использованный прогоном.
5. `memory-runs/a28da6b6089b3ee5a83d/class-validation.json` — статическая проверка 25 foundation entries без исполнения модулей.
6. `memory-runs/a28da6b6089b3ee5a83d/privacy.json` — результат проверки публичных данных.
7. `memory-runs/a28da6b6089b3ee5a83d/artifact-manifest.json` — размеры и SHA-256 артефактов.
8. Корневые `index.generated.json` и `promotion-ledger.json` — текущая опубликованная навигация и content-addressed история решений.

### Результат v6

| Метрика | Значение |
| --- | ---: |
| Composition tracks | 100 |
| Unit witnesses | 923 |
| Atomic Behaviour witnesses | 430 |
| Infrastructure Unit witnesses | 414 |
| Infrastructure Behaviour witnesses | 331 |
| Stylistic candidates | 5 |
| Evidence-ready candidates | 2 |
| Indexed infrastructure | 25 |
| Indexed memory Unit / Behaviour | 0 / 0 |
| Reconstruction proven | false |
| Automatic promotion allowed | false |
| Privacy findings | 0 |

Найденные candidates:

| Candidate | Состояние |
| --- | --- |
| `unit.dialogue-card.3157dd5e2669` | inventory: 1 workspace, class не emitted |
| `behaviour.staged-curve.0739b6532e65` | inventory: 1 workspace, class не emitted |
| `behaviour.staged-curve.0d8862fa2d3d` | evidenceReady, но reconstruction/feedback отсутствуют |
| `behaviour.staged-curve.53e3d5ee425f` | inventory: 1 workspace, class не emitted |
| `behaviour.staged-curve.d68470652e70` | evidenceReady, но reconstruction/feedback отсутствуют |

`evidenceReady` означает только независимое повторение fingerprint в нескольких workspaces при стабильной границе. Это не готовый класс, не human approval и не право на promotion. Нулевая memory mapping coverage здесь корректна: в индексе действительно нет ни одного `role: "memory"`.

`reconstructionProven=false` тоже корректен: run не emitted composition modules, не получил reconstruction receipts и не сравнивал semantic tree или pixels для кандидатов. Он обнаруживает материал для следующего этапа, но не подменяет этот этап метрикой сходства.

## Что именно делает production miner

Единственный production authority для mining — `src/memory/pipeline.js`; CLI над ним — `src/memory/cli.js`. Pipeline:

1. читает только tracks с `type === "composition"`;
2. статически разбирает source и не импортирует пользовательские composition modules;
3. отделяет foundation mechanics от stylistic candidates и residuals;
4. для Unit ищет минимальное связное стилизованное поддерево, поэтому контейнер из двух или пяти карточек не становится отдельным cardinality-specific классом;
5. для Behaviour рассматривает один визуальный канал и сохраняет fingerprint законченного authored temporal law;
6. повторяет census и требует одинаковый SHA-256, затем выпускает только privacy-safe агрегаты.

`src/mine.js` — legacy/research implementation. Он оставлен в Git для истории и отдельных тестов, но не экспортируется, не входит в npm package и не является вторым production authority.

## Архитектура классов

Основа — паттерн Component–Behaviour–Attributes из статьи [Norman the Necromancer](https://danthedev.com/norman-the-necromancer/), адаптированный к видео и статическому ESM.

- `Unit` renderer-neutral: в нём нет backend, React, Remotion, runtime или factory metadata.
- Итоговая композиция — настоящее parent/child дерево Unit. Composite Unit принимает уже созданный Unit и строит внутри него осмысленное вложенное поддерево; список экземпляров остаётся данными композиции.
- `Behaviour` принимает владельца-Unit в конструкторе, принадлежит только ему и изменяет ровно один визуальный канал.
- React и Remotion находятся за отдельными driver boundaries. Remotion — основной driver, React — fallback.
- Все используемые классы подключаются обычными static ESM imports. Dynamic factory registry отсутствует.

Foundation classes могут быть атомарными mechanics: `Text`, `Image`, `Group`, `Opacity`, `Scale` и другие. Их роль всегда `infrastructure`; сам факт, что opacity или scale встретились много раз, не превращает их в память.

Класс с `role: "memory"` обязан иметь стилистическую аутентичность:

- Unit должен кодировать собственные визуальные решения и вложенную структуру, а не быть thin wrapper над host element, CSS property или чужой библиотекой;
- Behaviour должен содержать authored frame-driven law, а не прокидывать `value`, callback, Signal или generic channel adapter;
- открытые `style`, `props`, `renderer`, `backend`, `factory`, `component` и подобные входы запрещены;
- bare `spring()`, `Math.sin()` или linear interpolation сами по себе остаются mechanics/infrastructure. Кандидатом может быть только конкретный одноканальный закон с собственной формулой и доказанной границей;
- fade и scale остаются отдельными каналами; комбинированный `fade+scale` Behaviour запрещён;
- clamp, lerp, перевод milliseconds в frames и другие числовые helpers не становятся Unit или Behaviour;
- импорт внешней библиотеки, renderer/runtime dependency или dynamic import не проходит module gate.

## Tree-shaking: что доказано

`package.json` содержит `sideEffects: false`, библиотека использует static ESM, а adapters импортируются по одному. Three-ветка появляется только при явном импорте Three adapter.

Важно различать две проверки:

- receipt старого profile experiment проверяет только статическую достижимость import graph; это не результат оптимизатора bundler;
- реальные esbuild-сборки находятся в `test/tree-shaking.test.js`: text-only entry не включает Canvas, Three и неиспользованные adapters/Behaviours.

Поэтому формулировка «tree-shaking проверен» допустима только со ссылкой на bundler tests, а не на один static-reachability receipt.

## Human feedback loop и promotion

После генерации система связывает `assistant generation event → candidate revision → module hash → dependency-closure hash → evidence hash`.

- Явный negative от пользователя немедленно даёт `discard`.
- Positive или neutral может стать candidate только после grace period не менее 30 секунд и при отсутствии более позднего negative.
- Structured UI feedback обрабатывается детерминированно и не требует LLM.
- Если structured signal отсутствует, free-text dialogue может классифицировать опциональный Kimi provider. Ему передаётся только ограниченное, редактированное окно пользовательских сообщений после генерации; URL, code blocks, secrets и assistant content не отправляются.
- Malformed, failed или ambiguous classification даёт quarantine, а не save.
- Ни classifier, ни API key не имеют права подписывать gates или делать promotion.

Promotion требует шесть подписанных receipts для одной и той же ревизии:

1. `compilerFidelity` — candidate найден и связан с проверяемой генерацией;
2. `reconstruction` — заявленное воспроизведение подтверждено evidence;
3. `atomicity` — один Behaviour-канал, без combined behaviours и helper classes;
4. `authenticity` — не thin wrapper, а стилистическое Unit-поддерево или authored temporal law;
5. `privacy` — публичный модуль и evidence не содержат private material;
6. `module` — корректный static ESM, допустимые imports и pinned dependency closure.

Model provider keys не являются gate authority. Для production gates нужны отдельные локальные секреты:

```text
CUT3_MEMORY_GATE_HMAC_KEY
CUT3_MEMORY_GATE_AUTHORITY_ID
CUT3_MEMORY_EVIDENCE_HMAC_KEY
CUT3_MEMORY_EVIDENCE_AUTHORITY_ID
```

Final gate authority и evidence authority должны использовать разные secrets. Значения не коммитятся и не попадают в stdout или публичные receipts.

## Нужны ли API-ключи

Для deterministic v6 mining API не нужен. Run `a28da6b6089b3ee5a83d` не использовал Kimi или Anthropic; `modelGenerationAuthority=false` записан в manifest.

- Kimi нужен только для опциональной классификации free-text feedback, когда нет structured UI signal.
- Anthropic для текущего v6 pipeline не нужен. Он использовался в историческом profile-search experiment и может применяться в отдельных research-прогонах.
- Наличие `KIMI`, `KIMI_API_KEY` или `Anthropic` в локальном `.env` не даёт права сохранять код и не заменяет HMAC authorities.

## Исторические артефакты

`experiment-runs/5e3007173aa16b1d67c7/` и `memory-runs/79e052bffa80599b77ad/` сохранены immutable для аудита, но не являются текущим результатом памяти.

- `experiment-runs/5e...` — historical foundation-only compiler profile selection: 20 выборов Kimi и 4 ревью Claude. Модели выбирали, какие заранее определённые lowering features измерить; они не создавали Unit/Behaviour памяти и не учились по human feedback.
- `memory-runs/79e...` создан старой схемой, которая называла 18 Unit и 7 Behaviour memory mapping. В актуальной role-aware схеме те же 25 записей reclassified как `infrastructure`.

Старые поля `publicBrick`, `reusableKinds` и старые coverage-числа нельзя использовать как доказательство памяти. Они описывают foundation lowering/navigation на исторической ревизии.

## Воспроизведение

Локальная проверка не делает платных вызовов:

```powershell
npm ci
npm test
npm pack --dry-run --json

node src/memory/cli.js `
  --input <dataset>/workspaces.jsonl `
  --out memory-runs `
  --repo .
```

Одинаковые bytes dataset плюс та же ревизия algorithm, index и promotion ledger должны дать тот же run ID. Dataset, `.env`, prompts, transcripts, URLs и composition source не должны добавляться в Git.

Быстрая ручная проверка артефактов:

```powershell
$manifest = Get-Content memory-runs/a28da6b6089b3ee5a83d/manifest.json -Raw | ConvertFrom-Json
$manifest.counts

$corpus = Get-Content memory-runs/a28da6b6089b3ee5a83d/corpus.json -Raw | ConvertFrom-Json
$corpus.memoryCandidates | Select-Object candidateKind, kind, family, witnesses, workspaces, eligibility

$index = Get-Content index.generated.json -Raw | ConvertFrom-Json
$index.entries | Group-Object role
```

Ожидаемый итог: 25 infrastructure entries, 0 memory entries, 5 candidates, из них 2 evidenceReady, `reconstructionProven=false` и `privacy.valid=true`.
