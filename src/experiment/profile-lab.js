import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CBA_V2_BASELINE_PROFILE,
  CBA_V2_PROFILES,
} from '../cba-v2/index.js';
import { sha256, stableStringify } from '../lib.js';
import { discoverLibrary } from '../library/discover.js';
import { buildNavigationIndex } from '../library/index.js';
import {
  assertValidLibrary,
  verifyDiscovery,
  verifyDomTreeShaking,
} from '../library/verify.js';
import { assertPublicArtifact, inspectPublicArtifact } from '../memory/privacy.js';
import { runModelAdvisoryLab } from '../model-lab/loop.js';
import { createProviderFromFile } from '../providers/index.js';
import { createWorkspaceSplit, parseWorkspaceDataset } from './split.js';
import {
  evaluateCbaProfile,
  isProfileImprovement,
  modelMetrics,
} from './profile-evaluator.js';

export const PROFILE_LAB_VERSION = 'cba-profile-lab-v1';

const EVALUATOR_FILES = Object.freeze([
  'src/cba-v2/analyzer.js',
  'src/cba-v2/compiler.js',
  'src/cba-v2/emitter.js',
  'src/cba-v2/parser.js',
  'src/cba-v2/verifier.js',
  'src/experiment/profile-evaluator.js',
  'src/experiment/profile-lab.js',
  'src/experiment/split.js',
]);

/**
 * Run twenty complete compiler profiles. Models choose evaluation order only;
 * deterministic all-frame metrics remain the sole acceptance authority.
 */
export async function runCbaProfileLab(inputText, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repositoryRoot, 'experiment-runs'));
  const dataset = parseWorkspaceDataset(inputText);
  const split = createWorkspaceSplit(dataset);
  const evaluator = await hashFiles(repositoryRoot, EVALUATOR_FILES);
  const discovery = await discoverLibrary({ rootDir: repositoryRoot });
  const libraryReport = verifyDiscovery(discovery);
  assertValidLibrary(libraryReport);
  const treeShaking = await verifyDomTreeShaking({
    rootDir: repositoryRoot,
    entries: ['core/drivers/react.js'],
  });
  if (!treeShaking.ok) throw new Error('DOM tree-shaking verification failed');
  const navigationIndex = buildNavigationIndex(discovery);

  const baseline = evaluateTuningProfile(dataset, split, CBA_V2_BASELINE_PROFILE);
  const candidateRecords = CBA_V2_PROFILES.map((profile) => ({
    profile,
    ...evaluateTuningProfile(dataset, split, profile),
  }));
  const byId = new Map(candidateRecords.map((record) => [record.profile.id, record]));
  const providers = await createLabProviders(options);
  let acceptedProfile = CBA_V2_BASELINE_PROFILE;
  const decisions = [];

  const lab = await runModelAdvisoryLab({
    rounds: 20,
    reviewCheckpoints: [5, 10, 15, 20],
    candidates: candidateRecords.map((record) => ({
      id: record.profile.id,
      metrics: withFlags(record.metrics, record.profile.features),
    })),
    initialMetrics: withFlags(baseline.metrics, CBA_V2_BASELINE_PROFILE.features),
    kimi: providers.kimi,
    anthropic: providers.anthropic,
    evaluateCandidate(candidate) {
      return withFlags(byId.get(candidate.id).metrics, byId.get(candidate.id).profile.features);
    },
    acceptCandidate(decision) {
      const accepted = isProfileImprovement(decision.candidateMetrics, decision.baselineMetrics);
      const previousProfileId = acceptedProfile.id;
      if (accepted) acceptedProfile = byId.get(decision.candidateId).profile;
      decisions.push({
        round: decision.round,
        candidateId: decision.candidateId,
        accepted,
        previousProfileId,
        nextProfileId: acceptedProfile.id,
      });
      return accepted;
    },
  });

  const heldout = evaluateCbaProfile(dataset, split, acceptedProfile, { splits: ['heldout'] });
  const full = evaluateCbaProfile(dataset, split, acceptedProfile, {
    splits: ['train', 'validation', 'heldout'],
  });
  const selectedTuning = acceptedProfile.id === CBA_V2_BASELINE_PROFILE.id
    ? baseline
    : byId.get(acceptedProfile.id);
  const resultHash = sha256(stableStringify({
    datasetSha256: dataset.inputSha256,
    evaluatorSha256: evaluator.sha256,
    acceptedProfile,
    lab,
    heldout,
  }));
  const experimentId = resultHash.slice(0, 20);
  const experimentDirectory = path.join(outputRoot, experimentId);

  const manifest = {
    schemaVersion: 1,
    experimentId,
    algorithm: PROFILE_LAB_VERSION,
    datasetSha256: dataset.inputSha256,
    evaluatorSha256: evaluator.sha256,
    resultSha256: resultHash,
    profilesEvaluated: CBA_V2_PROFILES.length,
    roundsCompleted: lab.roundsCompleted,
    acceptedProfileId: acceptedProfile.id,
    evaluatorDeterministic: true,
    advisoryDeterministic: false,
    modelDecisionAuthority: false,
    privateMaterialSentToProviders: false,
    heldoutOpenedAfterRounds: true,
    verificationLevel: 'render-tree-all-frames',
    pixelComparisonPerformed: false,
    oneToOneTreeVerified: full.treeExact,
    oneToOneVisualVerified: false,
    models: {
      proposer: providers.kimi.model,
      reviewer: providers.anthropic.model,
    },
  };
  const candidates = candidateRecords.map((record) => ({
    id: record.profile.id,
    features: record.profile.features,
    metrics: record.metrics,
  }));
  const finalMetrics = {
    selectedProfile: acceptedProfile,
    train: selectedTuning.train,
    validation: selectedTuning.validation,
    heldout,
    full,
  };
  const verification = {
    library: {
      valid: libraryReport.ok,
      entries: libraryReport.entries,
      modules: libraryReport.modules,
      failures: libraryReport.errors.length,
    },
    treeShaking: {
      valid: treeShaking.ok,
      reachableFiles: treeShaking.files.length,
      externalImports: treeShaking.externalImports.length,
      failures: treeShaking.errors.length,
    },
    navigationEntries: navigationIndex.entries.length,
    invalidBehaviourOwners: full.invalidOwners,
  };
  const publicFiles = new Map([
    ['manifest.json', manifest],
    ['split.json', split.manifest],
    ['evaluator.json', evaluator],
    ['baseline-metrics.json', baseline],
    ['candidates.json', candidates],
    ['rounds.json', { ...lab, decisions }],
    ['final-metrics.json', finalMetrics],
    ['verification.json', verification],
    ['index.snapshot.json', navigationIndex],
  ]);
  for (const value of publicFiles.values()) assertPublicArtifact(value);
  const artifactManifest = buildArtifactManifest(publicFiles);
  assertPublicArtifact(artifactManifest);
  publicFiles.set('artifact-manifest.json', artifactManifest);
  const findings = [...publicFiles.entries()].flatMap(([file, value]) => (
    inspectPublicArtifact(value).map((finding) => ({ file, ...finding }))
  ));
  const privacy = {
    schemaVersion: 1,
    valid: findings.length === 0,
    filesChecked: publicFiles.size,
    findings,
  };
  assertPublicArtifact(privacy);
  publicFiles.set('privacy.json', privacy);

  await Promise.all([...publicFiles.entries()].map(([relative, value]) => (
    writeJson(path.join(experimentDirectory, relative), value)
  )));
  if (options.writeIndex !== false) {
    await writeJson(path.join(repositoryRoot, 'index.generated.json'), navigationIndex, false);
  }
  return Object.freeze({
    experimentId,
    experimentDirectory,
    manifest,
    finalMetrics,
    privacy,
    navigationIndex,
    rounds: { ...lab, decisions },
  });
}

function evaluateTuningProfile(dataset, split, profile) {
  const train = evaluateCbaProfile(dataset, split, profile, { splits: ['train'] });
  const validation = evaluateCbaProfile(dataset, split, profile, { splits: ['validation'] });
  return {
    train,
    validation,
    metrics: modelMetrics(train, validation),
  };
}

async function createLabProviders(options) {
  if (options.kimi && options.anthropic) {
    return { kimi: options.kimi, anthropic: options.anthropic };
  }
  const common = {
    envFilePath: options.envFilePath,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxRetries: options.maxRetries ?? 1,
    maxTokens: options.maxTokens ?? 1_000,
  };
  return {
    kimi: options.kimi ?? await createProviderFromFile({ provider: 'kimi', ...common }),
    anthropic: options.anthropic ?? await createProviderFromFile({ provider: 'anthropic', ...common }),
  };
}

function withFlags(metrics, features) {
  return {
    ...metrics,
    flags: { ...features },
  };
}

async function hashFiles(root, files) {
  const entries = [];
  for (const relative of files) {
    const bytes = await fs.readFile(path.join(root, relative));
    entries.push({ file: relative, sha256: sha256(bytes) });
  }
  return {
    schemaVersion: 1,
    files: entries,
    sha256: sha256(stableStringify(entries)),
  };
}

function buildArtifactManifest(files) {
  const artifacts = [...files.entries()].map(([file, value]) => {
    const bytes = Buffer.from(`${stableStringify(value, 2)}\n`, 'utf8');
    return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }).sort((left, right) => left.file.localeCompare(right.file));
  const body = { schemaVersion: 1, artifacts };
  return { ...body, manifestSha256: sha256(stableStringify(body)) };
}

async function writeJson(filePath, value, immutable = true) {
  const bytes = `${stableStringify(value, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (!immutable) {
    await fs.writeFile(filePath, bytes, 'utf8');
    return;
  }
  try {
    const current = await fs.readFile(filePath, 'utf8');
    if (current !== bytes) throw new Error('immutable-experiment-artifact-collision');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await fs.writeFile(filePath, bytes, { encoding: 'utf8', flag: 'wx' });
  }
}
