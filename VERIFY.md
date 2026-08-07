# Cut3 Agent Memory 0.6

This version is an online code memory, not an offline dataset miner.

## What changed

The previous `promotion-ledger.json` was a transactional audit file for an offline promotion pipeline. It tracked hashes, dependency closures and gate receipts. That model was introduced by this project, was not part of Norman, and was unnecessary for an online coding agent. The file, promotion CLI, generated index, AST scanners and all Babel dependencies have been removed.

The catalog is now ordinary static ESM in `src/catalog.js`. It contains only:

- the class `static kind`;
- its global import path;
- the visual family;
- exact situations where it is useful;
- the authored traits it preserves.

There are no confidence scores, generated metadata or dynamic loaders.

The catalog contains only reusable Units and Behaviours. Full compositions and output builders are application code that consumes memory, not memory entries themselves.

## Source model

Norman the Necromancer does not define a formal CBA specification or a Unit tree. Its actual model is a flat list of `GameObject` instances, each owning an ordered list of Behaviours. The reusable idea is semantic ownership: `March`, `Bleeding`, `Seeking` and `Summon` retain complete actions instead of wrapping individual fields.

Reference inspected for this rewrite:

- article: https://danthedev.com/norman-the-necromancer/
- source commit: https://github.com/danprince/norman-the-necromancer/tree/5db8ca88c8038b3d0888addaa521a16db3c259a8

Cut3 keeps the owner-based Behaviour idea and deliberately adds a renderer-neutral Unit tree because video compositions need hierarchy, media slots and nested transitions. That tree is the Cut3 adaptation, not a claim about Norman.

Norman's application output lives in plain functions such as `Spell()`, `Villager()` and `Piper()` in `src/objects.ts`: construct an object, construct named Behaviours with that object, attach them in order, return the object. The Cut3 online agent now has the same output contract, with nested Units added for video.

```text
src/
├── core/          Unit, Behaviour, deterministic frame engine
├── units/
│   ├── base/      renderer-neutral infrastructure
│   └── <style>/   authored reusable visual trees
├── behaviours/    complete named visual laws grouped by style
├── compositions/  plain output builders and executable 9:16 demonstrations
├── drivers/       React and Remotion boundaries
├── fonts/         vendored-font manifest and preload contract
├── online/        exact feedback policy and coding-agent prompt
└── catalog.js     handwritten ESM navigation

misc/
└── test-runs/
    ├── tests/
    ├── render-showcase.js
    └── generated/  ignored local and legacy runs
```

All production imports are global package imports such as:

```js
import { Unit } from '@cut3/agent-memory/core/Unit';
import { EditorialImpactSettle }
  from '@cut3/agent-memory/behaviours/signal-editorial/EditorialImpactSettle';
```

The package has no root barrel, factory registry, runtime factory abstraction or dynamic import. Plain application builder functions are deliberately allowed; consumers still import only the classes they use.

## Actual online-agent output

`src/compositions/RitualOffer.js` is a runnable example of the exact artifact expected from the online coding agent:

```js
export function ritualOffer(text) {
  const unit = new RitualOfferCard(new Text(text));
  const entry = new RitualCardDeal(unit);
  const animation = new BoneIdleHop(unit);

  unit.addBehaviour(entry);
  unit.addBehaviour(animation);

  return unit;
}
```

The first argument is runtime data, not a schema. `RitualOfferCard` owns the nested visual tree but does not secretly select its entry or idle animation. The builder makes Behaviour choice and order readable application code. `RetroRitualRankingComposition` uses this same function for every ranking item and the winner; the example is not disconnected test scaffolding.

## What counts as memory

Infrastructure such as `Text`, `Box`, `CompositionPivot` and `VectorPath` is not stylistic memory.

A memory Behaviour must preserve one recognizable art-direction decision. It may and usually should coordinate multiple properties when those properties form one action. Examples:

- `EditorialImpactSettle`: asymmetric slam, recoil, focus, contrast and signal-red hard shadow;
- `CarbonCopyCadence`: uneven word rhythm, IBM Plex Mono treatment and carbon ink ghost;
- `RitualCardDeal`: integer-snapped card trajectory, purple recoil and held brightness frames.

Generic `Opacity`, `Scale`, `Translate`, `Blur`, interpolation and CSS-property Behaviours do not exist.

A memory Unit accepts runtime content and constructs a reusable visual tree around it. Customer text, URLs and transcripts remain constructor data and are never copied into the library.

Transforms live on `CompositionPivot`. Its `(x, y)` is expressed in absolute composition coordinates; the React/Remotion driver converts that directly to `transform-origin`. `CompositionPivot` validates its ancestry at render time and rejects shifted, transformed, bordered or partial-size containing blocks instead of silently degrading to a local pivot.

Nested full-composition `CompositionPivot` nodes are an explicit transform composition: each pivot is still authored in the original 1080×1920 coordinate system, then the outer pivot moves the complete result. Ordinary `Layer` and `Box` ancestors may not introduce that transform implicitly. Validation uses their projected frame state, so a Behaviour cannot dynamically bypass the rule.

Style Units are constructed in unshifted, full-composition containing blocks. Dynamic shadows use CSS `drop-shadow`, so pivots affect the contour of their authored subtree rather than drawing a shadow around a 1080×1920 wrapper.

Frame evaluation freezes the complete nested baseline, restores exact descriptors and object identities, and locks the Unit tree against structural edits. One whole-tree transaction covers visibility, child context and every Behaviour; React, Remotion and `Engine` consume immutable first-pass state and child snapshots only after restoration. Repeated projection is compared exactly. Across calls, one compact non-cryptographic 128-bit whole-frame fingerprint is retained for every context for the lifetime of the live root, with no 256-frame eviction; this detects common accidental private state or randomness without retaining every Unit snapshot. JavaScript cannot prove that arbitrary external code has no invisible side effects (and a non-cryptographic fingerprint has a theoretical collision), so frame purity remains an explicit Behaviour contract as well as a fail-closed runtime check.

The React fallback seeks and pauses a native video at `(startFrom + local frame) / fps` on every render. An injected React video component receives `frame`, `absoluteFrame`, `fps` and `startFrom`; the Remotion driver keeps `OffthreadVideo` timeline ownership.

Exact typography is shipped with the package, not delegated to host fallbacks:

- Barlow Condensed ExtraBold 800;
- IBM Plex Mono Medium 500;
- Silkscreen Bold 700.

The binaries and OFL licenses live in `src/assets/fonts/`; their SHA-256 values are fixed in `src/fonts/memory-fonts.js`. The driver embeds static `@font-face` rules. Remotion registration should additionally await `loadMemoryFonts()` once before rendering so the first frame cannot use a fallback.

## Demonstration compositions

### Signal Editorial

`src/compositions/SignalEditorialComposition.js`

Paper black, warm white and signal red; Barlow Condensed headline; cropped media plate; registration drawing; multi-channel impact settle; wide black carrier with signal-red and paper razor blades.

The incoming scene stays transparent until the wide carrier fully occludes the outgoing scene, then lands beneath the exiting blades through the authored focus/contrast treatment. It is a real handoff rather than a hard cut with decoration on top.

### Archival Dossier

`src/compositions/ArchivalDossierComposition.js`

Evidence-board paper, torn numeric path, oxide-red thread, carbon-copy transcript cadence and four-slat documentary transition.

The incoming dossier develops only after the shutter slats cover the outgoing scene.

### Retro Ritual Ranking

`src/compositions/RetroRitualRankingComposition.js`

Low-resolution bone palette, soul-green rune drawing, integer-snapped deal, held-frame hop and 6×10 portal mosaic. The same `RitualOfferCard` is used for two, twenty or any other positive number of items. Rankings are paginated four cards at a time, so cardinality stays data without making later cards cover earlier text.

Inspect their evaluated trees at representative frames:

```sh
npm run showcase
npm run showcase:browser
```

`showcase:browser` runs the real React adapter in headless Chrome/Edge and regenerates three 1080×700 PNG contact sheets under `misc/test-runs/showcase/`. Each sheet shows the authored entrance, transition and final scene.

## Online learning decision

`src/online/outcome.js` has exactly three actions:

- `wait`: no terminal success signal or compile/render is incomplete;
- `discard`: correction, regeneration, manual edit, revert, deletion or failed compile/render;
- `save`: compile and render succeeded and the exact revision was exported, published, reused or followed by a new task without changes.

Negative signals have priority. Silence never saves anything. There are no confidence values and no model call in this decision.

The dialog observer does not ask a model whether feedback was positive. Composer persists the exact compile, render, edit and workspace events in an injected `revisionAuthority`; that durable authority applies the table above and binds the decision to `revisionId + sourceSha256` and an immutable source checkout.

For `save`, `OnlineMemoryAgent` acquires a recoverable lease with a monotonic fencing token. The whole job has an absolute deadline; heartbeat RPCs and cleanup are independently bounded, so a hung model or storage call cannot renew or block a reservation forever. The coding agent receives only a disposable isolated candidate workspace created from the immutable source; writable `main` is never mounted and no raw user prompt, module path, URL or transcript is interpolated into the agent prompt. The candidate reuses the static catalog and writes ordinary ESM classes directly. It never parses an AST or returns generated JSON.

The candidate is sealed before review and bound to its exact source SHA-256, artifact digest and Git commit. Publication requires structured passing evidence for compile, tests, representative render, privacy and semantic style review. `accepted: true` alone is rejected. The durable authority rechecks current events and the lease under its serialized publication boundary, then applies exactly the sealed artifact idempotently. A stale worker cannot publish or release a newer lease.

A negative event during work cancels the candidate. A negative event after persistence immediately tombstones the memory for readers and creates a durable, restart-safe obligation to revert or remove its persisted commit. Rejected candidates are disposed without touching `main`, so a retry starts clean.

This repository defines and adversarially tests the ports; the production durable authority, isolated Git-worktree/artifact adapter and automated reviewer still belong in Composer infrastructure. Kimi, Anthropic or another coding model may implement `runAgent` and, optionally, semantic review. The event decision itself needs no API key.

## Verification

```sh
npm test
npm run showcase
npm run showcase:browser
npm pack --dry-run
```

The tests execute all three compositions, covered-scene transition handoffs, React/Remotion adapter semantics, paginated ranking cardinality, runtime-enforced absolute pivots, exact fonts and hashes, source offsets, path intervals, whole-tree projection rollback, observable frame consistency, global imports, isolated candidates, concurrent negative signals, stale-lease fencing, operation/heartbeat deadlines, structured review receipts and post-completion retraction.
