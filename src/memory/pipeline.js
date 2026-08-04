import fs from 'node:fs/promises';
import path from 'node:path';

import { sha256, stableStringify } from '../lib.js';
import { writeNavigationIndex } from '../library/index.js';
import { buildClassIndex } from './class-index.js';
import { buildCorpusCensus } from './corpus.js';
import { evaluateMemoryCandidate } from './evaluate.js';
import { assertPublicArtifact, inspectPublicArtifact } from './privacy.js';

export const MEMORY_ALGORITHM_VERSION = 'class-memory-v3.1.0-static-index-receipts';

export async function runMemoryPipeline(inputText, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repositoryRoot, 'memory-runs'));
  const firstCensus = buildCorpusCensus(inputText);
  const secondCensus = buildCorpusCensus(inputText);
  const deterministic = firstCensus.censusSha256 === secondCensus.censusSha256;
  if (!deterministic) throw new Error('memory-pipeline-nondeterministic');

  const { index, validation: classValidation } = await buildClassIndex(repositoryRoot);
  const metrics = evaluateMemoryCandidate(firstCensus, index, classValidation, {
    reconstructionReceipts: options.reconstructionReceipts ?? [],
  });
  const runId = sha256(stableStringify({
    algorithmVersion: MEMORY_ALGORITHM_VERSION,
    censusSha256: firstCensus.censusSha256,
    indexSha256: index.indexSha256,
    metricsSha256: metrics.metricsSha256,
  })).slice(0, 20);
  const runDirectory = path.join(outputRoot, runId);
  const manifest = {
    schemaVersion: 3,
    runId,
    algorithmVersion: MEMORY_ALGORITHM_VERSION,
    censusSha256: firstCensus.censusSha256,
    indexSha256: index.indexSha256,
    metricsSha256: metrics.metricsSha256,
    deterministic,
    counts: {
      compositions: firstCensus.counts.compositions,
      unitWitnesses: firstCensus.counts.unitWitnesses,
      visualSinks: firstCensus.counts.visualSinks,
      atomicBehaviourWitnesses: firstCensus.counts.atomicBehaviourWitnesses,
      indexedUnits: classValidation.units,
      indexedBehaviours: classValidation.behaviours,
    },
    proofLevel: metrics.proofLevel,
    reconstructionProven: metrics.reconstruction.oneToOneVerified,
    automaticPromotionAllowed: false,
    refinementAuthority: 'experiment-profile-lab',
    containsRawCompositionData: false,
  };
  const publicFiles = new Map([
    ['manifest.json', manifest],
    ['corpus.json', firstCensus],
    ['index.snapshot.json', index],
    ['class-validation.json', classValidation],
    ['metrics.json', metrics],
  ]);
  for (const value of publicFiles.values()) assertPublicArtifact(value);
  const artifactManifest = buildArtifactManifest(publicFiles);
  assertPublicArtifact(artifactManifest);
  publicFiles.set('artifact-manifest.json', artifactManifest);
  const findings = [...publicFiles.entries()].flatMap(([file, value]) => (
    inspectPublicArtifact(value).map((finding) => ({ file, ...finding }))
  ));
  const privacy = {
    schemaVersion: 2,
    valid: findings.length === 0,
    filesChecked: publicFiles.size,
    findings,
  };
  assertPublicArtifact(privacy);
  publicFiles.set('privacy.json', privacy);

  await Promise.all([...publicFiles.entries()].map(([relative, value]) => (
    writeImmutableJson(path.join(runDirectory, relative), value)
  )));
  if (options.writeIndex !== false) {
    await writeNavigationIndex(index, path.join(repositoryRoot, 'index.generated.json'));
  }

  return Object.freeze({
    runId,
    runDirectory,
    manifest,
    census: firstCensus,
    index,
    classValidation,
    metrics,
    privacy,
  });
}

function buildArtifactManifest(files) {
  const artifacts = [...files.entries()].map(([file, value]) => {
    const bytes = Buffer.from(`${stableStringify(value, 2)}\n`, 'utf8');
    return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }).sort((left, right) => left.file.localeCompare(right.file));
  const body = { schemaVersion: 1, artifacts };
  return { ...body, manifestSha256: sha256(stableStringify(body)) };
}

async function writeImmutableJson(filePath, value) {
  const bytes = `${stableStringify(value, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const current = await fs.readFile(filePath, 'utf8');
    if (current !== bytes) throw new Error('immutable-artifact-collision');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.writeFile(filePath, bytes, { encoding: 'utf8', flag: 'wx' });
  }
}
