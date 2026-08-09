import { memoryCatalog } from '@cut3/agent-memory/catalog';

export function buildMemoryAgentPrompt() {
  const catalog = memoryCatalog.map((entry) => (
    `${entry.id} | ${entry.import} | ${entry.style} | use: ${entry.useWhen.join('; ')} | preserves: ${entry.preserves.join('; ')}`
  )).join('\n');
  return `You maintain @cut3/agent-memory after one successful Cut3 workspace revision.

Goal: preserve a reusable ART DIRECTION, never the user's scene, transcript, URL or copy.

Inspect the successful revision through the immutable source checkout and write only in the disposable isolated candidate workspace supplied to you. The writable main memory checkout is never mounted here. No user prompt is included in this task.

Existing memory catalog:
${catalog}

Before writing:
1. Inspect the successful composition and the catalog. Reuse an existing Unit or Behaviour when it preserves the same art direction.
2. If the existing class only needs different content, do not create a variant. Content and cardinality are constructor data.
3. Create a class only for a named, recognizable stylistic solution: coordinated geometry, palette, typography, drawing and/or motion.

Behaviour contract:
- extend Behaviour directly; constructor receives its owner Unit first;
- own a complete visual law such as a paper slam, carbon-copy cadence or pixel portal cut;
- coordinate multiple visual decisions or an authored drawing/timing algorithm;
- keep the characteristic constants in the class;
- derive output only from the supplied immutable frame context, never previous calls or hidden state;
- use context.frame for Shot-local motion; use context.absoluteFrame only for an explicitly global timeline law;
- never mutate Behaviour state or Unit ownership in onFrame();
- never create Opacity, Scale, Translate, Blur, CSSProperty, Interpolate or library-import wrappers.

Unit contract:
- extend a renderer-neutral renderable Unit base and construct a real nested Unit tree;
- accept runtime content as Units; never embed customer text, URLs or transcripts;
- use CompositionPivot for transforms and express its pivot in absolute composition coordinates;
- keep optional entry/idle Behaviours out of the Unit constructor so the output function chooses and orders them explicitly;
- keep renderer/backend fields out of Units and Behaviours.

Required workspace output:
- export a plain ESM builder function whose first argument is runtime content;
- do not validate, classify or guard runtime input inside the builder; pass it directly into Units;
- inside it, construct the root Unit, instantiate each named Behaviour with that exact Unit, call unit.addBehaviour(...) in authored order, and return the Unit;
- the builder is executable application code, not a Composition class, descriptor, schema or JSON response;

Shape:
export function build(runtimeText) {
  const unit = new StyledUnit(new Text(runtimeText));
  const entry = new AuthoredEntry(unit);
  const idle = new AuthoredIdle(unit);
  unit.addBehaviour(entry);
  unit.addBehaviour(idle);
  return unit;
}

Module contract:
- use only global @cut3/agent-memory/... ESM imports;
- no dynamic imports, factory registries, runtime factory abstractions, AST parsing or generated JSON;
- write Behaviours to src/behaviours/<style>/, Units to src/units/<style>/;
- update src/catalog.js by hand with import path, exact use cases and preserved visual traits;
- add or update a plain builder under src/compositions/ that visibly proves reuse at different content/cardinality;
- add node:test coverage under misc/test-runs/tests/.
- run npm test and npm run showcase inside the candidate; inspect its change set for customer text, URLs, transcripts and credentials.

The isolated candidate change set is the output. A separate reviewer will bind compile, tests, render, privacy and semantic evidence to its exact digest and commit before a fenced transaction may apply it. Do not access or modify main, return source as JSON, or create a promotion ledger.`;
}
