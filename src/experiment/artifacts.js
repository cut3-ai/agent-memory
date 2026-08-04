import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, stableStringify } from '../lib.js';

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'source',
  'rawSource',
  'prompt',
  'transcript',
  'cover',
]);
const RAW_URL_PATTERN = /https?:\/\//i;

export function buildRoundPlan() {
  return {
    schemaVersion: 1,
    maximumRounds: 20,
    rounds: Array.from({ length: 20 }, (_, index) => ({
      round: index + 1,
      state: 'pending',
      proposalRequired: true,
      acceptance: 'frozen-deterministic-evaluator',
    })),
  };
}

export function digestArtifact(value) {
  assertPublicArtifact(value);
  return sha256(stableStringify(value));
}

export function assertPublicArtifact(value, pathParts = []) {
  if (typeof value === 'string') {
    if (RAW_URL_PATTERN.test(value)) {
      throw new Error(`Public artifact contains a raw URL at ${pathParts.join('.') || '<root>'}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((nested, index) => assertPublicArtifact(nested, [...pathParts, index]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      throw new Error(`Public artifact contains forbidden key: ${key}`);
    }
    assertPublicArtifact(nested, [...pathParts, key]);
  }
}

export async function writeExperimentArtifacts(rootDirectory, roundZero) {
  const root = path.resolve(rootDirectory, roundZero.experiment.experimentId);
  const roundDirectory = path.join(root, 'rounds', '00');
  const files = new Map([
    ['experiment.json', roundZero.experiment],
    ['evaluator-manifest.json', roundZero.evaluatorManifest],
    ['split.json', roundZero.splitManifest],
    ['round-plan.json', roundZero.roundPlan],
    ['rounds/00/metrics.json', roundZero.metrics],
    ['rounds/00/determinism.json', roundZero.determinism],
  ]);
  await fs.mkdir(roundDirectory, { recursive: true });

  const entries = [];
  for (const [relativePath, value] of files) {
    assertPublicArtifact(value);
    const text = `${stableStringify(value, 2)}\n`;
    await fs.writeFile(path.join(root, relativePath), text, 'utf8');
    entries.push({ path: relativePath.replaceAll('\\', '/'), sha256: sha256(text) });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const artifactManifest = {
    schemaVersion: 1,
    experimentId: roundZero.experiment.experimentId,
    files: entries,
    combinedSha256: sha256(stableStringify(entries)),
  };
  await fs.writeFile(
    path.join(roundDirectory, 'artifact-manifest.json'),
    `${stableStringify(artifactManifest, 2)}\n`,
    'utf8',
  );
  return { root, artifactManifest };
}

export async function writeRoundArtifacts(experimentRoot, round, artifacts) {
  if (!Number.isInteger(round) || round < 1 || round > 20) {
    throw new RangeError('round must be an integer from 1 through 20');
  }
  assertPublicArtifact(artifacts);
  const directory = path.join(path.resolve(experimentRoot), 'rounds', String(round).padStart(2, '0'));
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'artifacts.json'),
    `${stableStringify(artifacts, 2)}\n`,
    'utf8',
  );
  return directory;
}
