import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CBA_V2_BASELINE_PROFILE,
  CBA_V2_SEARCH_SPACE,
} from '../cba-v2/index.js';
import { sha256, stableStringify } from '../lib.js';
import { discoverLibrary } from '../library/discover.js';
import {
  buildNavigationIndex,
  validateNavigationIndex,
} from '../library/index.js';
import {
  assertValidLibrary,
  verifyDiscovery,
  verifyDomTreeShaking,
} from '../library/verify.js';
import { assertPublicArtifact, inspectPublicArtifact } from '../memory/privacy.js';
import { runLiveModelAdvisoryLab } from '../model-lab/live.js';
import { runModelAdvisoryLab } from '../model-lab/loop.js';
import { validateModelLabCheckpoint } from '../model-lab/checkpoint.js';
import { createWorkspaceSplit, parseWorkspaceDataset } from './split.js';
import {
  evaluateCbaProfile,
  isProfileImprovement,
  modelMetrics,
} from './profile-evaluator.js';
import {
  createSequentialProfileFrontier,
  PROFILE_SEARCH_ROUNDS,
  profileStructuralMetrics,
} from './profile-search.js';
import { selectDeterministicProfile } from './profile-selection.js';
import { writeJsonAtomically } from './durable-storage.js';
import {
  persistProviderCallIntent,
  reconcileProviderCallIntent,
  settleProviderCallIntent,
} from './profile-progress.js';

export const PROFILE_LAB_VERSION = 'cba-foundation-profile-search-v5';
export const DEFAULT_PROFILE_LAB_ATTEMPT_ID = 'legacy-default';

const PROFILE_LAB_ATTEMPT_ID = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;

const EVALUATOR_DIRECTORIES = Object.freeze([
  'core',
  'units',
  'behaviours',
  'src/cba-v2',
  'src/experiment',
  'src/library',
  'src/model-lab',
  'src/providers',
]);
const EVALUATOR_ROOT_FILES = Object.freeze([
  'package.json',
  'package-lock.json',
  'src/lib.js',
  'src/normalize.js',
  'src/memory/gate-receipts.js',
  'src/memory/privacy.js',
]);
const EVALUATOR_OPTIONAL_ROOT_FILES = Object.freeze(['promotion-ledger.json']);

/** Gate the paid search locally, then search twenty lazily revealed profiles. */
export async function runCbaProfileLab(inputText, options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const outputRoot = path.resolve(options.outputRoot ?? path.join(repositoryRoot, 'experiment-runs'));
  const attemptId = normalizeProfileLabAttemptId(options.attemptId);
  const dataset = parseWorkspaceDataset(inputText);
  const split = createWorkspaceSplit(dataset);
  const evaluator = await hashEvaluatorClosure(repositoryRoot);
  const discovery = await discoverLibrary({ rootDir: repositoryRoot });
  const libraryReport = verifyDiscovery(discovery);
  assertValidLibrary(libraryReport);
  if (discovery.promotion?.ok !== true) {
    throw new Error('Promotion ledger verification failed');
  }
  const domDriverStaticReachability = await verifyDomTreeShaking({
    rootDir: repositoryRoot,
    entries: ['core/drivers/react.js'],
  });
  if (!domDriverStaticReachability.ok) {
    throw new Error('DOM driver static import reachability verification failed');
  }
  const navigationIndex = buildNavigationIndex(discovery);
  const indexReport = validateNavigationIndex(navigationIndex);
  if (!indexReport.ok) throw new Error('Generated navigation index failed validation');
  const evaluationAssurance = Object.freeze({
    libraryVerified: libraryReport.ok,
    promotionVerified: discovery.promotion.ok,
    indexVerified: indexReport.ok,
    foundationKinds: new Set(navigationIndex.entries
      .filter(({ role }) => role === 'infrastructure')
      .map(({ kind }) => kind)),
    memoryKinds: new Set(navigationIndex.entries
      .filter(({ role }) => role === 'memory')
      .map(({ kind }) => kind)),
  });

  const baseline = evaluateTuningProfile(
    dataset,
    split,
    CBA_V2_BASELINE_PROFILE,
    evaluationAssurance,
  );
  const profilesById = new Map(CBA_V2_SEARCH_SPACE.map((profile) => [profile.id, profile]));
  const allFeatureProfile = CBA_V2_SEARCH_SPACE.find(({ features }) => (
    Object.values(features).every(Boolean)
  ));
  if (!allFeatureProfile) throw new Error('Profile catalog is missing its all-feature anchor');
  const allFeatureEvaluation = evaluateTuningProfile(
    dataset,
    split,
    allFeatureProfile,
    evaluationAssurance,
  );
  const preflight = createCapabilityPreflight(
    baseline,
    allFeatureProfile,
    allFeatureEvaluation,
  );
  assertPublicArtifact(preflight);
  if (!preflight.passed) {
    throw new Error('All-feature profile failed the local foundation-brick preflight');
  }
  const revealCandidateIds = createSequentialProfileFrontier(
    CBA_V2_SEARCH_SPACE,
    CBA_V2_BASELINE_PROFILE,
  );
  const candidateCatalog = CBA_V2_SEARCH_SPACE.map((profile) => ({
    id: profile.id,
    metrics: profileStructuralMetrics(profile),
  }));
  const checkpointBindingSha256 = sha256(stableStringify({
    algorithm: PROFILE_LAB_VERSION,
    optimizationScope: 'foundation-lowering-only',
    authenticMemoryClassesGenerated: 0,
    attemptId,
    datasetSha256: dataset.inputSha256,
    evaluatorSha256: evaluator.sha256,
    navigationIndexSha256: navigationIndex.indexSha256,
    promotionLedgerSha256: evaluator.files
      .find(({ file }) => file === 'promotion-ledger.json')?.sha256 ?? null,
    splitSha256: sha256(stableStringify(split.manifest)),
    candidateCatalog,
    initialMetrics: baseline.metrics,
    preflightSha256: sha256(stableStringify(preflight)),
    models: configuredModelNames(options),
  }));
  const progressDirectory = path.join(
    outputRoot,
    '.profile-lab-progress',
    checkpointBindingSha256,
  );
  const resumed = options.resume === false
    ? await requireEmptyCheckpointDirectory(progressDirectory)
    : await loadCheckpointChain(progressDirectory, checkpointBindingSha256, {
      candidateIds: candidateCatalog.map(({ id }) => id),
      initialMetrics: baseline.metrics,
    });
  await reconcileProviderCallIntent(progressDirectory, {
    bindingSha256: checkpointBindingSha256,
    checkpoints: resumed.checkpoints,
  });
  const checkpointHashes = [...resumed.hashes];

  const advisoryOptions = {
    rounds: PROFILE_SEARCH_ROUNDS,
    reviewCheckpoints: [5, 10, 15, 20],
    candidates: candidateCatalog,
    initialMetrics: baseline.metrics,
    revealCandidateIds,
    checkpointBindingSha256,
    resumeCheckpoint: resumed.checkpoint,
    evaluateCandidate(candidate) {
      if (candidate.id === allFeatureProfile.id) return allFeatureEvaluation.metrics;
      return evaluateTuningProfile(
        dataset,
        split,
        profilesById.get(candidate.id),
        evaluationAssurance,
      ).metrics;
    },
    // This only advances the search incumbent exposed as aggregate counters to
    // the next Kimi round. Final selection is recomputed order-independently
    // from every evaluated profile after the search finishes.
    acceptCandidate(decision) {
      return isProfileImprovement(decision.candidateMetrics, decision.baselineMetrics);
    },
    async onPhaseCheckpoint(checkpoint) {
      assertPublicArtifact(checkpoint);
      await writeJson(
        path.join(
          progressDirectory,
          `phase-${String(checkpoint.sequence).padStart(3, '0')}.json`,
        ),
        checkpoint,
      );
      checkpointHashes.push(checkpoint.checkpointSha256);
    },
    async onProviderIntent(intent) {
      await persistProviderCallIntent(progressDirectory, intent);
    },
    async onProviderCheckpointed(intent, checkpoint) {
      await settleProviderCallIntent(progressDirectory, intent, checkpoint);
    },
  };
  const lab = await runProfileAdvisoryLab(advisoryOptions, options, repositoryRoot);
  const models = modelNamesFromLab(lab);
  // The all-feature profile is already measured by the free preflight.  Keep
  // that known result in the deterministic candidate set even when the model
  // spends all twenty advisory rounds on other profiles.
  const evaluatedRecordsById = new Map([[
    allFeatureProfile.id,
    { profile: allFeatureProfile, metrics: allFeatureEvaluation.metrics },
  ]]);
  for (const evaluation of lab.evaluations) {
    evaluatedRecordsById.set(evaluation.candidateId, {
      profile: profilesById.get(evaluation.candidateId),
      metrics: evaluation.metrics,
    });
  }
  const evaluatedRecords = [...evaluatedRecordsById.values()];
  const selection = selectDeterministicProfile({
    profile: CBA_V2_BASELINE_PROFILE,
    metrics: baseline.metrics,
  }, evaluatedRecords);
  const selectedProfile = selection.selectedProfileId === CBA_V2_BASELINE_PROFILE.id
    ? CBA_V2_BASELINE_PROFILE
    : profilesById.get(selection.selectedProfileId);
  const decisions = lab.evaluations.map((evaluation) => ({
    round: evaluation.round,
    candidateId: evaluation.candidateId,
    eligibleAgainstBaseline: isProfileImprovement(evaluation.metrics, baseline.metrics),
    becameSearchIncumbent: evaluation.accepted,
  }));

  const heldout = evaluateCbaProfile(dataset, split, selectedProfile, {
    ...evaluationAssurance,
    splits: ['heldout'],
  });
  const full = evaluateCbaProfile(dataset, split, selectedProfile, {
    ...evaluationAssurance,
    splits: ['train', 'validation', 'heldout'],
  });
  const selectedTuning = selection.selectedProfileId === CBA_V2_BASELINE_PROFILE.id
    ? baseline
    : evaluateTuningProfile(dataset, split, selectedProfile, evaluationAssurance);
  const resultHash = sha256(stableStringify({
    attemptId,
    checkpointBindingSha256,
    datasetSha256: dataset.inputSha256,
    evaluatorSha256: evaluator.sha256,
    navigationIndexSha256: navigationIndex.indexSha256,
    promotionLedgerSha256: evaluator.files
      .find(({ file }) => file === 'promotion-ledger.json')?.sha256 ?? null,
    selectedProfile,
    selection,
    lab,
    preflight,
    heldout,
  }));
  const experimentId = resultHash.slice(0, 20);
  const experimentDirectory = path.join(outputRoot, experimentId);

  const manifest = {
    schemaVersion: 1,
    experimentId,
    algorithm: PROFILE_LAB_VERSION,
    optimizationScope: 'foundation-lowering-only',
    authenticMemoryClassesGenerated: 0,
    attemptId,
    checkpointBindingSha256,
    datasetSha256: dataset.inputSha256,
    evaluatorSha256: evaluator.sha256,
    resultSha256: resultHash,
    searchSpaceSize: CBA_V2_SEARCH_SPACE.length,
    profilesEvaluated: lab.evaluations.length,
    profilesPreEvaluated: true,
    preflightProfilesEvaluated: 1,
    preflightPassed: preflight.passed,
    sequentialReveal: true,
    roundsCompleted: lab.roundsCompleted,
    checkpointMode: 'append-only-hash-chain',
    providerResponsesCheckpointedBeforeContinuation: true,
    providerIntentPersistedBeforeNetwork: true,
    ambiguousProviderReplayPolicy: 'fail-closed-manual-reconciliation',
    transparentAmbiguousResume: false,
    atomicCheckpointPublication: true,
    directorySyncBestEffortWhenUnsupported: true,
    phaseCheckpoints: lab.phaseCheckpointsCompleted,
    providerCallsCumulative: {
      kimi: lab.history.length,
      anthropic: lab.history.filter(({ review }) => review !== null).length,
      total: lab.history.length + lab.history.filter(({ review }) => review !== null).length,
    },
    selectedProfileId: selectedProfile.id,
    evaluatorDeterministic: true,
    advisoryDeterministic: false,
    modelAcceptanceAuthority: false,
    modelSearchOrderAuthority: true,
    evaluatedSubsetModelInfluenced: true,
    finalSelectionDeterministic: true,
    finalSelectionOrderIndependentWithinEvaluatedSet: true,
    privateMaterialSentToProviders: false,
    heldoutOpenedAfterRounds: true,
    splitOutcomeBlind: true,
    validationRole: 'workspace-disjoint-tuning-split',
    heldoutRole: 'process-heldout-within-known-development-corpus',
    externalUnseenCorpusEvaluated: false,
    verificationLevel: 'generated-esm-parse-and-render-tree-all-frames',
    pixelComparisonPerformed: false,
    treeMatchedIncludingFallback: full.structurallyMatchedCases === full.cases,
    foundationBrickStructuralOneToOneVerified:
      full.foundationBrickStructuralExactCases === full.cases,
    authenticMemoryStructuralExactCases: full.authenticMemoryStructuralExactCases,
    oneToOneVisualVerified: false,
    models,
  };
  const searchMetricsById = new Map(lab.evaluations.map((evaluation) => [
    evaluation.candidateId,
    evaluation.metrics,
  ]));
  const metricsById = new Map(searchMetricsById);
  metricsById.set(allFeatureProfile.id, allFeatureEvaluation.metrics);
  const candidates = CBA_V2_SEARCH_SPACE.map((profile) => ({
    id: profile.id,
    features: profile.features,
    evaluated: metricsById.has(profile.id),
    evaluatedInPreflight: profile.id === allFeatureProfile.id,
    evaluatedInSearch: searchMetricsById.has(profile.id),
    ...(metricsById.has(profile.id) ? { metrics: metricsById.get(profile.id) } : {}),
  }));
  const finalMetrics = {
    selectedProfile,
    selection,
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
    promotion: {
      valid: discovery.promotion.ok,
      promotedEntries: discovery.promotion.promotedEntries.length,
      excludedEntries: discovery.promotion.excludedEntries.length,
      failures: discovery.promotion.errors.length,
      ledgerSha256: discovery.promotion.ledgerSha256,
    },
    domDriverStaticReachability: {
      valid: domDriverStaticReachability.ok,
      method: 'static-esm-import-reachability',
      bundlerOptimizationProven: false,
      reachableFiles: domDriverStaticReachability.files.length,
      externalImports: domDriverStaticReachability.externalImports.length,
      failures: domDriverStaticReachability.errors.length,
    },
    navigationEntries: navigationIndex.entries.length,
    navigationIndexValid: indexReport.ok,
    invalidBehaviourOwners: full.invalidOwners,
    foundationBrickStructuralExactCases: full.foundationBrickStructuralExactCases,
    authenticMemoryStructuralExactCases: full.authenticMemoryStructuralExactCases,
    fallbackMatchedCases: full.fallbackMatchedCases,
    foundationUnitCoverage: full.foundationUnitCoverage,
    authenticMemoryUnitOccurrences: full.authenticMemoryUnitOccurrences,
    authenticMemoryBehaviourOccurrences: full.authenticMemoryBehaviourOccurrences,
    nativeUnits: full.nativeUnits,
    localBehaviours: full.localBehaviours,
    residualVisualComputations: full.residualVisualComputations,
    unsupportedEffectCases: full.unsupportedEffectCases,
  };
  if (checkpointHashes.length !== lab.phaseCheckpointsCompleted
      || checkpointHashes.at(-1) !== lab.lastCheckpointSha256) {
    throw new Error('Durable model checkpoint chain is incomplete');
  }
  const checkpointChain = {
    schemaVersion: 1,
    attemptId,
    bindingSha256: checkpointBindingSha256,
    completedRounds: lab.roundsCompleted,
    phaseCheckpoints: lab.phaseCheckpointsCompleted,
    checkpointSha256s: checkpointHashes,
    lastCheckpointSha256: lab.lastCheckpointSha256,
  };
  const publicFiles = new Map([
    ['manifest.json', manifest],
    ['split.json', split.manifest],
    ['evaluator.json', evaluator],
    ['baseline-metrics.json', baseline],
    ['preflight.json', preflight],
    ['candidates.json', candidates],
    ['rounds.json', { ...lab, decisions }],
    ['final-metrics.json', finalMetrics],
    ['verification.json', verification],
    ['index.snapshot.json', navigationIndex],
    ['checkpoint-chain.json', checkpointChain],
  ]);
  for (const value of publicFiles.values()) assertPublicArtifact(value);
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
  const artifactManifest = buildArtifactManifest(publicFiles);
  assertPublicArtifact(artifactManifest);
  publicFiles.set('artifact-manifest.json', artifactManifest);

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
    selection,
  });
}

/** A bounded opaque label that cannot be interpreted as a filesystem path. */
export function normalizeProfileLabAttemptId(value = DEFAULT_PROFILE_LAB_ATTEMPT_ID) {
  if (typeof value !== 'string' || !PROFILE_LAB_ATTEMPT_ID.test(value)) {
    throw new TypeError('Profile lab attempt id must be 1-64 lowercase ASCII letters, digits, underscores or hyphens, with an alphanumeric first and last character');
  }
  return value;
}

function evaluateTuningProfile(dataset, split, profile, assurance) {
  const train = evaluateCbaProfile(dataset, split, profile, {
    ...assurance,
    splits: ['train'],
  });
  const validation = evaluateCbaProfile(dataset, split, profile, {
    ...assurance,
    splits: ['validation'],
  });
  return {
    train,
    validation,
    metrics: modelMetrics(train, validation),
  };
}

function createCapabilityPreflight(baseline, profile, evaluation) {
  const baselineTrainFoundationBrickCases = (
    baseline.metrics.train.foundationBrickStructuralExactCases
  );
  const allFeatureTrainFoundationBrickCases = (
    evaluation.metrics.train.foundationBrickStructuralExactCases
  );
  const baselineValidationFoundationBrickCases = (
    baseline.metrics.validation.foundationBrickStructuralExactCases
  );
  const allFeatureValidationFoundationBrickCases = (
    evaluation.metrics.validation.foundationBrickStructuralExactCases
  );
  const fidelityPreserved = ['train', 'validation'].every((split) => {
    const left = baseline.metrics[split];
    const right = evaluation.metrics[split];
    return right.compileFailures <= left.compileFailures
      && right.renderErrorFrames <= left.renderErrorFrames
      && right.mismatchedFrames <= left.mismatchedFrames
      && right.exactCases >= left.exactCases
      && right.matchedFrames >= left.matchedFrames;
  });
  const body = {
    schemaVersion: 1,
    mode: 'local-aggregate-gate',
    profileId: profile.id,
    baselineTrainFoundationBrickCases,
    allFeatureTrainFoundationBrickCases,
    trainFoundationBrickCaseDelta: allFeatureTrainFoundationBrickCases
      - baselineTrainFoundationBrickCases,
    baselineValidationFoundationBrickCases,
    allFeatureValidationFoundationBrickCases,
    validationFoundationBrickCaseDelta: allFeatureValidationFoundationBrickCases
      - baselineValidationFoundationBrickCases,
    generalizationSplit: 'validation',
    fidelityPreserved,
    deterministicImprovement: isProfileImprovement(evaluation.metrics, baseline.metrics),
    candidateOutcomeSentToProviders: false,
    baseline: baseline.metrics,
    allFeature: evaluation.metrics,
  };
  return deepFreeze({
    ...body,
    passed: body.validationFoundationBrickCaseDelta > 0
      && body.fidelityPreserved
      && body.deterministicImprovement,
  });
}

async function runProfileAdvisoryLab(advisoryOptions, options, repositoryRoot) {
  const hasKimi = options.kimi !== undefined;
  const hasAnthropic = options.anthropic !== undefined;
  if (hasKimi !== hasAnthropic) {
    throw new TypeError('Test advisory providers must be supplied as a pair');
  }
  if (hasKimi) {
    return runModelAdvisoryLab({
      ...advisoryOptions,
      kimi: options.kimi,
      anthropic: options.anthropic,
    });
  }
  return runLiveModelAdvisoryLab({
    ...advisoryOptions,
    cwd: repositoryRoot,
    envFilePath: options.envFilePath,
    confirmPaidCalls: options.confirmPaidCalls,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxRetries: 0,
    maxTokens: options.maxTokens ?? 512,
    kimiModel: options.kimiModel,
    anthropicModel: options.anthropicModel,
  });
}

function modelNamesFromLab(lab) {
  return {
    proposer: lab.history[0]?.selection?.model ?? 'unknown',
    reviewer: lab.history.find((round) => round.review)?.review?.model ?? 'unknown',
  };
}

async function hashEvaluatorClosure(root) {
  const files = [...EVALUATOR_ROOT_FILES];
  for (const optional of EVALUATOR_OPTIONAL_ROOT_FILES) {
    try {
      const stat = await fs.stat(path.join(root, optional));
      if (stat.isFile()) files.push(optional);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  for (const directory of EVALUATOR_DIRECTORIES) {
    files.push(...await listFilesRecursively(root, directory));
  }
  files.sort();
  const entries = [];
  for (const relative of files) {
    const bytes = await fs.readFile(path.join(root, relative));
    entries.push({ file: relative, sha256: sha256(bytes) });
  }
  const body = {
    schemaVersion: 1,
    scope: 'static-local-closure-plus-domain-library',
    nodeVersion: process.versions.node,
    files: entries,
  };
  return { ...body, sha256: sha256(stableStringify(body)) };
}

async function listFilesRecursively(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(root, relative));
    else if (entry.isFile() && /\.(?:js|json|mjs)$/u.test(entry.name)) files.push(relative);
  }
  return files;
}

async function loadCheckpointChain(directory, bindingSha256, validation) {
  let names;
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { checkpoint: undefined, checkpoints: [], hashes: [] };
    }
    throw error;
  }
  const checkpointNames = names
    .filter((name) => /^phase-\d{3}\.json$/u.test(name))
    .sort();
  let previousCheckpointSha256 = null;
  let checkpoint;
  const checkpoints = [];
  const hashes = [];
  for (const [index, name] of checkpointNames.entries()) {
    const expectedSequence = index + 1;
    if (name !== `phase-${String(expectedSequence).padStart(3, '0')}.json`) {
      throw new Error('Model lab checkpoint files must form a contiguous chain');
    }
    const value = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
    assertPublicArtifact(value);
    checkpoint = validateModelLabCheckpoint(value, {
      bindingSha256,
      previousCheckpointSha256,
      candidateIds: validation.candidateIds,
      initialMetrics: validation.initialMetrics,
    });
    if (checkpoint.sequence !== expectedSequence) {
      throw new Error('Model lab checkpoint filename does not match its sequence');
    }
    previousCheckpointSha256 = checkpoint.checkpointSha256;
    checkpoints.push(checkpoint);
    hashes.push(previousCheckpointSha256);
  }
  return { checkpoint, checkpoints, hashes };
}

async function requireEmptyCheckpointDirectory(directory) {
  try {
    const names = await fs.readdir(directory);
    if (names.some((name) => /^phase-\d{3}\.json$/u.test(name))) {
      throw new Error('A bound checkpoint chain already exists; resume it instead');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { checkpoint: undefined, checkpoints: [], hashes: [] };
}

function configuredModelNames(options) {
  return {
    kimi: options.kimi?.model ?? options.kimiModel ?? 'kimi-k2.6',
    anthropic: options.anthropic?.model ?? options.anthropicModel ?? 'claude-sonnet-5',
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
  await writeJsonAtomically(filePath, value, immutable);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
