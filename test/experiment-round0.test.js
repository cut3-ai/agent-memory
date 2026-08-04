import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertPublicArtifact, writeExperimentArtifacts } from '../src/experiment/artifacts.js';
import {
  createCandidateImplementationManifest,
  createFrozenEvaluatorManifest,
} from '../src/experiment/manifest.js';
import { runRoundZero } from '../src/experiment/round0.js';
import { createWorkspaceSplit, parseWorkspaceDataset } from '../src/experiment/split.js';

test('workspace split is deterministic and keeps every workspace in one split', () => {
  const dataset = parseWorkspaceDataset(fixtureDataset());
  const left = createWorkspaceSplit(dataset);
  const right = createWorkspaceSplit(dataset);

  assert.deepEqual(left.manifest, right.manifest);
  assert.deepEqual(left.manifest.counts.splits, {
    train: { workspaces: 6, compositions: 12 },
    validation: { workspaces: 2, compositions: 4 },
    heldout: { workspaces: 2, compositions: 4 },
  });
  assert.equal(new Set(left.manifest.assignments.map((entry) => entry.workspaceKey)).size, 10);
});

test('workspace identity and assignments do not change when JSONL lines are reordered', () => {
  const lines = fixtureDataset().split('\n');
  const forward = createWorkspaceSplit(parseWorkspaceDataset(lines.join('\n')));
  const reversed = createWorkspaceSplit(parseWorkspaceDataset(lines.reverse().join('\n')));

  assert.deepEqual(forward.manifest, reversed.manifest);
});

test('workspaces connected by an exact composition source never cross splits', () => {
  const dataset = parseWorkspaceDataset(fixtureDataset({ duplicateChainAcrossWorkspaces: true }));
  const split = createWorkspaceSplit(dataset);
  const owners = new Map();

  for (const workspace of dataset.workspaces) {
    const assigned = split.assignmentByWorkspaceKey.get(workspace.workspaceKey);
    for (const composition of workspace.compositions) {
      const previous = owners.get(composition.sourceHash);
      if (previous) assert.equal(assigned, previous);
      owners.set(composition.sourceHash, assigned);
    }
  }
  const duplicateWorkspaces = dataset.workspaces.slice(0, 3);
  const duplicateAssignments = split.manifest.assignments.filter((assignment) => (
    duplicateWorkspaces.some((workspace) => workspace.workspaceKey === assignment.workspaceKey)
  ));
  assert.equal(new Set(duplicateAssignments.map((assignment) => assignment.split)).size, 1);
  assert.equal(new Set(duplicateAssignments.map((assignment) => assignment.groupKey)).size, 1);
});

test('frozen evaluator manifest and round-0 double run are byte stable', () => {
  const evaluator = createFrozenEvaluatorManifest();
  const candidate = createCandidateImplementationManifest();
  assert.deepEqual(evaluator, createFrozenEvaluatorManifest());
  assert.equal(Object.hasOwn(evaluator.sourceDigests, 'src/cba/semantic-harness.js'), true);
  assert.equal(Object.hasOwn(evaluator.sourceDigests, 'src/cba/compiler.js'), false);
  assert.equal(Object.hasOwn(candidate.compiler.sourceDigests, 'src/cba/compiler.js'), true);
  assert.equal(Object.hasOwn(candidate.compiler.sourceDigests, 'src/normalize.js'), true);
  assert.equal(Object.hasOwn(candidate.pipeline.sourceDigests, 'src/cba/pipeline.js'), true);
  assert.equal(Object.hasOwn(candidate.memory.sourceDigests, 'schemas/index-entry.schema.json'), true);
  const first = runRoundZero(fixtureDataset());
  const second = runRoundZero(fixtureDataset());

  assert.equal(first.determinism.byteIdentical, true);
  assert.equal(first.determinism.digestA, first.determinism.digestB);
  assert.equal(first.determinism.digestA, second.determinism.digestA);
  assert.equal(first.roundPlan.rounds.length, 20);
  assert.equal(first.metrics.oneToOneVerified, false);
  assert.ok(first.metrics.splits.train.runtime.framesExecuted > 0);
  assert.equal(
    first.metrics.splits.train.semantic.exactCompositions,
    first.metrics.splits.train.compositions,
  );
  assert.equal(
    first.metrics.splits.train.semantic.matchedFrames,
    first.metrics.splits.train.semantic.totalFrames,
  );
  assert.equal(first.metrics.splits.train.semantic.effectTraceMismatches, 0);
  assert.equal(first.metrics.splits.train.semantic.canvasTraceMismatches, 0);
  assert.ok(first.metrics.splits.train.residualExpressionClosures > 0);
  assert.equal(first.metrics.splits.train.minedRecipes.coverage, 0);
  assert.equal(first.experiment.modelApiCalls, 0);
  assert.equal(
    first.experiment.candidateImplementation.implementationHash,
    first.metrics.candidateImplementation.implementationHash,
  );
});

test('semantic render failures use sanitized public codes', () => {
  const roundZero = runRoundZero(fixtureDataset({ renderErrorAtFirstComposition: true }));
  const splitMetrics = Object.values(roundZero.metrics.splits);
  const failedResults = splitMetrics.flatMap((metrics) => metrics.compositionResults)
    .filter((result) => result.semantic?.failureCode);
  assert.equal(failedResults.length, 1);
  assert.equal(failedResults[0].semantic.failureCode, 'semantic-render-error');
  assert.equal(
    splitMetrics.reduce((sum, metrics) => sum + metrics.semantic.compositionsWithRenderErrors, 0),
    1,
  );
  assert.equal(splitMetrics.reduce((sum, metrics) => sum + metrics.semantic.renderErrors, 0), 60);
  assert.equal(
    splitMetrics.reduce((sum, metrics) => sum + metrics.semantic.baselineRenderErrors, 0),
    30,
  );
  assert.equal(
    splitMetrics.reduce((sum, metrics) => sum + metrics.semantic.generatedRenderErrors, 0),
    30,
  );
  assert.equal(failedResults[0].semantic.firstMismatch.baselineError, 'Error');
  assert.equal(failedResults[0].semantic.firstMismatch.generatedError, 'Error');
  assert.doesNotMatch(JSON.stringify(roundZero), /PRIVATE_RENDER_FAILURE/);
});

test('public artifact skeleton contains no raw source, text, or URLs', async () => {
  const roundZero = runRoundZero(fixtureDataset());
  const serialized = JSON.stringify(roundZero);
  assert.doesNotMatch(serialized, /PRIVATE_TRANSCRIPT/);
  assert.doesNotMatch(serialized, /example\.test/);
  assert.doesNotThrow(() => assertPublicArtifact(roundZero));
  assert.throws(
    () => assertPublicArtifact({ source: 'const secret = true;' }),
    /forbidden key/,
  );
  assert.throws(
    () => assertPublicArtifact({ value: 'https://example.test/private.png' }),
    /raw URL/,
  );

  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cba-experiment-'));
  try {
    const written = await writeExperimentArtifacts(temporaryRoot, roundZero);
    const plan = JSON.parse(await fs.readFile(path.join(written.root, 'round-plan.json'), 'utf8'));
    const metrics = JSON.parse(await fs.readFile(
      path.join(written.root, 'rounds', '00', 'metrics.json'),
      'utf8',
    ));
    const artifactManifest = JSON.parse(await fs.readFile(
      path.join(written.root, 'rounds', '00', 'artifact-manifest.json'),
      'utf8',
    ));
    assert.equal(plan.rounds.length, 20);
    assert.equal(metrics.proofLevel, 'compiler-structural-and-all-frame-semantic');
    assert.equal(artifactManifest.files.length, 6);
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

function fixtureDataset(options = {}) {
  const duplicateSources = [
    [
      "const SHARED_MEDIA_A = 'https://example.test/shared-private-a.png';",
      'const GeneratedComposition = () => <AbsoluteFill><span>SHARED_PRIVATE_TEXT_A</span></AbsoluteFill>;',
    ].join('\n'),
    [
      "const SHARED_MEDIA_B = 'https://example.test/shared-private-b.png';",
      'const GeneratedComposition = () => <AbsoluteFill><span>SHARED_PRIVATE_TEXT_B</span></AbsoluteFill>;',
    ].join('\n'),
  ];
  return Array.from({ length: 10 }, (_, workspaceIndex) => JSON.stringify({
    width: 1080,
    height: 1920,
    fps: 30,
    tracks: Array.from({ length: 2 }, (_, compositionIndex) => ({
      id: `private-${workspaceIndex}-${compositionIndex}`,
      type: 'composition',
      start: compositionIndex * 1000,
      length: 1000,
      source: options.duplicateChainAcrossWorkspaces
        && ((compositionIndex === 0 && (workspaceIndex === 0 || workspaceIndex === 1))
          || (compositionIndex === 1 && (workspaceIndex === 1 || workspaceIndex === 2)))
        ? duplicateSources[compositionIndex]
        : options.renderErrorAtFirstComposition
          && workspaceIndex === 0
          && compositionIndex === 0
          ? "const GeneratedComposition = () => { throw new Error('PRIVATE_RENDER_FAILURE'); };"
          : [
        `const MEDIA_${workspaceIndex}_${compositionIndex} = 'https://example.test/private-${workspaceIndex}-${compositionIndex}.png';`,
        'const GeneratedComposition = () => {',
        '  const frame = useCurrentFrame();',
        `  return <AbsoluteFill style={{opacity: frame / 30}}><span>PRIVATE_TRANSCRIPT_${workspaceIndex}_${compositionIndex}</span></AbsoluteFill>;`,
        '};',
        ].join('\n'),
    })),
  })).join('\n');
}
