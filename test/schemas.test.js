import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { mineDataset } from '../src/mine.js';

const schemaDirectory = new URL('../schemas/', import.meta.url);

function readSchema(name) {
  return JSON.parse(fs.readFileSync(new URL(name, schemaDirectory), 'utf8'));
}

function compileIndexEntryValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  return ajv.compile(readSchema('index-entry.schema.json'));
}

function mutate(value, mutation) {
  const copy = structuredClone(value);
  mutation(copy);
  return copy;
}

function assertMutationRejected(validate, entry, label, mutation) {
  const candidate = mutate(entry, mutation);
  assert.equal(validate(candidate), false, `${label} unexpectedly satisfied index-entry.schema.json`);
}

test('public observations, preview index and manifest satisfy their schemas', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const observationSchema = readSchema('observation.schema.json');
  const indexEntrySchema = readSchema('index-entry.schema.json');
  const previewIndexSchema = readSchema('preview-index.schema.json');
  const manifestSchema = readSchema('run-manifest.schema.json');
  const timelineArrangementSchema = readSchema('timeline-arrangement.schema.json');
  ajv.addSchema(indexEntrySchema);

  const source = 'const GeneratedComposition=()=>{const frame=useCurrentFrame();return <div style={{opacity:interpolate(frame,[0,10],[0,1])}}>text</div>}';
  const input = JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 60,
    length: 1000,
    tracks: [{ id: 'private-user-id', type: 'composition', start: 0, length: 1000, source }],
  });
  const run = mineDataset(input);

  const validateObservation = ajv.compile(observationSchema);
  assert.ok(run.observations.every((observation) => validateObservation(observation)), validateObservation.errors);
  assert.equal(validateObservation(run.observationsPrivate[0]), false, 'private observation must not satisfy public schema');

  const validatePreview = ajv.compile(previewIndexSchema);
  assert.ok(validatePreview(run.previewIndex), validatePreview.errors);
  for (const entry of run.previewIndex.entries) {
    const embeddedSchema = entry.kind === 'unit' ? entry.propsSchema : entry.configSchema;
    assert.ok(ajv.validateSchema(embeddedSchema), ajv.errorsText());
    assert.doesNotThrow(() => ajv.compile(embeddedSchema));
  }

  const validateManifest = ajv.compile(manifestSchema);
  assert.ok(validateManifest(run.manifest), validateManifest.errors);

  const validateArrangement = ajv.compile(timelineArrangementSchema);
  assert.ok(
    run.timelineArrangements.every((arrangement) => validateArrangement(arrangement)),
    validateArrangement.errors,
  );
});

test('index entries reject non-atomic and semantically inconsistent mutations', () => {
  const source = `
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      const opacity = interpolate(frame, [0, 10], [0, 1]);
      return <AbsoluteFill style={{backgroundColor: '#fff', opacity}} />;
    };
  `;
  const input = JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 60,
    length: 1000,
    tracks: [{ id: 'private-user-id', type: 'composition', start: 0, length: 1000, source }],
  });
  const entries = mineDataset(input).previewIndex.entries;
  const unit = entries.find((entry) => entry.id === 'overlay.solid-fill');
  const behavior = entries.find((entry) => entry.id === 'motion.opacity');
  const validate = compileIndexEntryValidator();

  assert.ok(unit, 'fixture must produce a unit entry');
  assert.ok(behavior, 'fixture must produce a behavior entry');
  assert.ok(validate(unit), validate.errors);
  assert.ok(validate(behavior), validate.errors);

  const invalidMutations = [
    ['unit kind cannot be changed independently', unit, (entry) => { entry.kind = 'behavior'; }],
    ['behavior kind cannot be changed independently', behavior, (entry) => { entry.kind = 'unit'; }],
    ['unit id cannot use a behavior namespace', unit, (entry) => { entry.id = 'motion.solid-fill'; }],
    ['behavior id cannot use a unit namespace', behavior, (entry) => { entry.id = 'overlay.opacity'; }],
    ['unit requires a renderable boundary', unit, (entry) => { entry.atomicity.boundary = 'single-visual-channel'; }],
    ['behavior requires a channel boundary', behavior, (entry) => { entry.atomicity.boundary = 'single-renderable'; }],
    ['behavior cannot write multiple channels', behavior, (entry) => {
      entry.writes = ['opacity', 'transform.scale'];
    }],
    ['behavior cannot publish a composite channel', behavior, (entry) => { entry.writes = ['transform']; }],
    ['behavior cannot publish a utility as a write', behavior, (entry) => {
      entry.writes = ['util.math.clamp'];
    }],
    ['unit cannot carry behavior fields', unit, (entry) => {
      entry.configSchema = structuredClone(behavior.configSchema);
      entry.requiresCapabilities = [...behavior.requiresCapabilities];
      entry.writes = [...behavior.writes];
    }],
    ['behavior cannot carry unit fields', behavior, (entry) => {
      entry.propsSchema = structuredClone(unit.propsSchema);
      entry.providesCapabilities = [...unit.providesCapabilities];
    }],
    ['unit props schema must describe an object root', unit, (entry) => {
      entry.propsSchema.type = 'string';
    }],
    ['behavior config schema must describe an object root', behavior, (entry) => {
      entry.configSchema.type = 'array';
    }],
    ['embedded schema must remain closed', behavior, (entry) => {
      entry.configSchema.additionalProperties = true;
    }],
    ['evidence must come from local AST occurrences', unit, (entry) => {
      entry.evidence.supportBasis = 'whole-composition-signals';
    }],
    ['independent local support cannot be empty', unit, (entry) => {
      entry.evidence.independentOccurrences = 0;
    }],
    ['an entry must own at least one atomic occurrence', behavior, (entry) => {
      entry.extraction.atomicOccurrences = 0;
    }],
    ['an entry must expose at least one local sample occurrence', behavior, (entry) => {
      entry.evidence.sampleOccurrences = [];
    }],
    ['unlocated spans cannot enter the generated index', behavior, (entry) => {
      entry.extraction.spansAvailable = false;
      entry.extraction.state = 'recognized-not-extracted';
    }],
  ];

  for (const [label, entry, mutation] of invalidMutations) {
    assertMutationRejected(validate, entry, label, mutation);
  }
});
