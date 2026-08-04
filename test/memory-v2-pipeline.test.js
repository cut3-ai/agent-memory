import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildClassIndex } from '../src/memory/class-index.js';
import { buildCorpusCensus } from '../src/memory/corpus.js';
import { evaluateMemoryCandidate } from '../src/memory/evaluate.js';
import { runMemoryPipeline } from '../src/memory/pipeline.js';
import { inspectPublicArtifact } from '../src/memory/privacy.js';
import { evaluateReconstructionReceipts } from '../src/memory/reconstruction.js';

const RECEIPT = 'a'.repeat(64);

test('navigation index entries contain only kind, type, source and export', async (context) => {
  const root = await fixtureRepository(context);
  const { index, validation } = await buildClassIndex(root);
  assert.equal(validation.valid, true);
  assert.equal(index.units.length, 1);
  assert.equal(index.behaviours.length, 1);
  for (const entry of [...index.units, ...index.behaviours]) {
    assert.deepEqual(Object.keys(entry).sort(), ['export', 'kind', 'source', 'type']);
  }
  const serialized = JSON.stringify(index);
  assert.doesNotMatch(serialized, /dependencies|parameters|confidence|writes|import\s*\(/);
  assert.deepEqual(inspectPublicArtifact(index), []);
});

test('mapping never becomes exact without complete reconstruction receipts', () => {
  const census = buildCorpusCensus(workspaceFixture());
  const index = {
    units: [
      { kind: 'unit.layer' },
      { kind: 'unit.text' },
    ],
    behaviours: [{ kind: 'behaviour.opacity' }],
  };
  const noProof = evaluateMemoryCandidate(census, index, { valid: true });
  assert.equal(noProof.mapping.unitKindMappingCoverage, 1);
  assert.equal(noProof.mapping.behaviourKindMappingCoverage, 1);
  assert.equal(noProof.reconstruction.oneToOneVerified, false);
  assert.equal(noProof.reconstruction.missingCompositions, 1);
  assert.equal(noProof.residuals.sourceDependentVisualComputations, 1);

  const composition = census.compositions[0];
  const receipt = {
    compositionKey: composition.compositionKey,
    receiptSha256: RECEIPT,
    moduleEmitted: true,
    moduleImported: true,
    graphExact: true,
    semanticFrames: {
      compared: composition.frameCount,
      matched: composition.frameCount,
    },
    pixelFrames: {
      compared: composition.frameCount,
      matched: composition.frameCount,
    },
    residuals: {
      unitWitnesses: 0,
      behaviourWitnesses: 0,
      sourceDependentVisualComputations: 0,
      functionValuedConfigs: 0,
      rawExecutableAstNodes: 0,
    },
  };
  const proof = evaluateReconstructionReceipts(census, [receipt]);
  assert.equal(proof.semanticOneToOneVerified, true);
  assert.equal(proof.pixelOneToOneVerified, true);
  assert.equal(proof.oneToOneVerified, true);
});

test('pipeline emits deterministic privacy-safe metadata and a minimal index', async (context) => {
  const root = await fixtureRepository(context);
  const outputRoot = path.join(root, 'runs');
  const input = workspaceFixture();
  const first = await runMemoryPipeline(input, { repositoryRoot: root, outputRoot });
  const second = await runMemoryPipeline(input, { repositoryRoot: root, outputRoot });
  assert.equal(first.runId, second.runId);
  assert.equal(first.census.censusSha256, second.census.censusSha256);
  assert.equal(first.privacy.valid, true);
  assert.equal(first.metrics.reconstruction.oneToOneVerified, false);

  const generated = JSON.parse(await fs.readFile(
    path.join(root, 'index.generated.json'),
    'utf8',
  ));
  for (const entry of [...generated.units, ...generated.behaviours]) {
    assert.deepEqual(Object.keys(entry).sort(), ['export', 'kind', 'source', 'type']);
  }
  const artifacts = await readJsonTree(first.runDirectory);
  const serialized = JSON.stringify(artifacts);
  assert.doesNotMatch(serialized, /PRIVATE_SENTENCE|private\.invalid|https?:\/\//i);
  artifacts.forEach((artifact) => assert.deepEqual(inspectPublicArtifact(artifact), []));
});

function workspaceFixture() {
  const source = [
    'const halve = (value) => value / 2;',
    'const GeneratedComposition = () => {',
    '  const frame = useCurrentFrame();',
    '  const opacity = interpolate(frame, [0, 9], [0, 1]);',
    "  return <AbsoluteFill><span style={{opacity}}>PRIVATE_SENTENCE</span></AbsoluteFill>;",
    '};',
  ].join('\n');
  return `${JSON.stringify({
    width: 100,
    height: 100,
    fps: 10,
    length: 1_000,
    tracks: [{
      type: 'composition',
      start: 0,
      length: 1_000,
      source,
      meta: {
        prompt: 'PRIVATE_SENTENCE',
        transcript: 'PRIVATE_SENTENCE',
        cover: 'https://private.invalid/image.png',
      },
    }],
  })}\n`;
}

async function fixtureRepository(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cut3-memory-v2-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await Promise.all([
    fs.mkdir(path.join(root, 'core'), { recursive: true }),
    fs.mkdir(path.join(root, 'units'), { recursive: true }),
    fs.mkdir(path.join(root, 'behaviours'), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n'),
    fs.writeFile(path.join(root, 'core', 'Unit.js'), 'export class Unit {}\n'),
    fs.writeFile(path.join(root, 'core', 'Behaviour.js'), 'export class Behaviour {}\n'),
    fs.writeFile(path.join(root, 'units', 'shared.js'), 'export const finite = Number.isFinite;\n'),
    fs.writeFile(path.join(root, 'units', 'text.js'), [
      "import { Unit } from '../core/Unit.js';",
      'export class Text extends Unit {',
      "  static kind = 'unit.text';",
      '}',
      '',
    ].join('\n')),
    fs.writeFile(path.join(root, 'behaviours', 'opacity.js'), [
      "import { Behaviour } from '../core/Behaviour.js';",
      'export class Opacity extends Behaviour {',
      "  static kind = 'behaviour.opacity';",
      '}',
      '',
    ].join('\n')),
  ]);
  return root;
}

async function readJsonTree(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const nested = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await readJsonTree(nested));
    else if (entry.name.endsWith('.json')) output.push(JSON.parse(await fs.readFile(nested, 'utf8')));
  }
  return output;
}
