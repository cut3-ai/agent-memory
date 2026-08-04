import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256, stableStringify } from '../lib.js';

export const EVALUATOR_VERSION = 'cba-round0-evaluator-v1';

const EXPERIMENT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(EXPERIMENT_DIRECTORY, '..', '..');
const FROZEN_SOURCES = Object.freeze([
  ['src/cba/semantic-harness.js', path.join(REPOSITORY_ROOT, 'src', 'cba', 'semantic-harness.js')],
  ['src/experiment/evaluator.js', path.join(EXPERIMENT_DIRECTORY, 'evaluator.js')],
  ['src/experiment/manifest.js', path.join(EXPERIMENT_DIRECTORY, 'manifest.js')],
  ['src/experiment/split.js', path.join(EXPERIMENT_DIRECTORY, 'split.js')],
  ['src/lib.js', path.join(REPOSITORY_ROOT, 'src', 'lib.js')],
]);
const CANDIDATE_COMPILER_SOURCES = Object.freeze([
  ['src/cba/compiler.js', path.join(REPOSITORY_ROOT, 'src', 'cba', 'compiler.js')],
  ['src/normalize.js', path.join(REPOSITORY_ROOT, 'src', 'normalize.js')],
]);
const CANDIDATE_RUNTIME_SOURCES = Object.freeze([
  ['core/Behaviour.js', path.join(REPOSITORY_ROOT, 'core', 'Behaviour.js')],
  ['core/Unit.js', path.join(REPOSITORY_ROOT, 'core', 'Unit.js')],
  ['core/drivers/react.js', path.join(REPOSITORY_ROOT, 'core', 'drivers', 'react.js')],
  ['core/drivers/remotion.js', path.join(REPOSITORY_ROOT, 'core', 'drivers', 'remotion.js')],
  ['core/runtime.js', path.join(REPOSITORY_ROOT, 'core', 'runtime.js')],
  ['src/cba/catalog.js', path.join(REPOSITORY_ROOT, 'src', 'cba', 'catalog.js')],
]);
const CANDIDATE_PIPELINE_SOURCES = Object.freeze([
  ['src/cba/evaluate.js', path.join(REPOSITORY_ROOT, 'src', 'cba', 'evaluate.js')],
  ['src/cba/pipeline.js', path.join(REPOSITORY_ROOT, 'src', 'cba', 'pipeline.js')],
]);
const CANDIDATE_MEMORY_SOURCE_ROOTS = Object.freeze([
  ['behaviors', path.join(REPOSITORY_ROOT, 'behaviors')],
  ['behaviours', path.join(REPOSITORY_ROOT, 'behaviours')],
  ['recipes', path.join(REPOSITORY_ROOT, 'recipes')],
  ['schemas', path.join(REPOSITORY_ROOT, 'schemas')],
  ['units', path.join(REPOSITORY_ROOT, 'units')],
]);

export function createFrozenEvaluatorManifest() {
  const sourceDigests = Object.fromEntries(FROZEN_SOURCES.map(([logicalName, filePath]) => [
    logicalName,
    sha256(fs.readFileSync(filePath)),
  ]));
  const body = {
    schemaVersion: 1,
    evaluatorVersion: EVALUATOR_VERSION,
    frozen: true,
    nodeVersion: process.versions.node,
    sourceDigests,
    splitPolicy: {
      unit: 'workspace',
      train: 0.6,
      validation: 0.2,
      heldout: 0.2,
    },
    metricScope: {
      measured: [
        'compiler-parse',
        'reversible-instrumentation',
        'reversible-jsx-lowering',
        'jsx-unit-accounting',
        'visual-sink-accounting',
        'control-accounting',
        'factory-occurrence-accounting',
        'all-frame-semantic-tree-equivalence',
        'effect-trace-equivalence',
        'canvas-command-trace-equivalence',
        'behaviour-attachment-diagnostics',
      ],
      notMeasured: [
        'generated-module-linking',
        'factory-resolution',
        'pixel-equivalence',
      ],
    },
  };
  return {
    ...body,
    evaluatorHash: sha256(stableStringify(body)),
  };
}

export function createCandidateImplementationManifest() {
  const compilerSourceDigests = digestSources(CANDIDATE_COMPILER_SOURCES);
  const runtimeSourceDigests = digestSources(CANDIDATE_RUNTIME_SOURCES);
  const pipelineSourceDigests = digestSources(CANDIDATE_PIPELINE_SOURCES);
  const memorySourceDigests = digestSourceRoots(CANDIDATE_MEMORY_SOURCE_ROOTS);
  const packageLockPath = path.join(REPOSITORY_ROOT, 'package-lock.json');
  const body = {
    schemaVersion: 1,
    compiler: {
      sourceDigests: compilerSourceDigests,
      combinedSha256: sha256(stableStringify(compilerSourceDigests)),
    },
    runtime: {
      sourceDigests: runtimeSourceDigests,
      combinedSha256: sha256(stableStringify(runtimeSourceDigests)),
    },
    pipeline: {
      sourceDigests: pipelineSourceDigests,
      combinedSha256: sha256(stableStringify(pipelineSourceDigests)),
    },
    memory: {
      sourceDigests: memorySourceDigests,
      combinedSha256: sha256(stableStringify(memorySourceDigests)),
    },
    packageLockSha256: fs.existsSync(packageLockPath)
      ? sha256(fs.readFileSync(packageLockPath))
      : null,
  };
  return {
    ...body,
    implementationHash: sha256(stableStringify(body)),
  };
}

function digestSources(sources) {
  return Object.fromEntries(sources.map(([logicalName, filePath]) => [
    logicalName,
    sha256(fs.readFileSync(filePath)),
  ]));
}

function digestSourceRoots(roots) {
  const sources = [];
  for (const [logicalRoot, sourceRoot] of roots) {
    if (!fs.existsSync(sourceRoot)) continue;
    for (const filePath of walkFiles(sourceRoot)) {
      const relative = path.relative(sourceRoot, filePath).replaceAll('\\', '/');
      sources.push([`${logicalRoot}/${relative}`, filePath]);
    }
  }
  sources.sort(([left], [right]) => left.localeCompare(right));
  return digestSources(sources);
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const nested = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(nested));
    else if (entry.isFile()) files.push(nested);
  }
  return files;
}
