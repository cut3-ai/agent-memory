import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RULES,
  detectInfrastructureMatches,
  detectMatches,
} from './detectors.js';
import { extractObservation } from './extract.js';
import { sha256, stableStringify } from './lib.js';
import { completeLinkClusters } from './similarity.js';
import { detectTimelineArrangements } from './timeline.js';

export const ALGORITHM_VERSION = 'memory-miner-v2.0.0-authentic-tree';
export const ALGORITHM_DIGEST = computeAlgorithmDigest();

export function mineDataset(inputText, options = {}) {
  const config = {
    clusterThreshold: Number(options.clusterThreshold ?? 0.85),
  };
  const ingested = ingestJsonl(inputText);

  for (const observation of ingested.observations) {
    observation.memoryMatches = detectMatches(observation);
    observation.infrastructureMatches = detectInfrastructureMatches(observation);
    // Compatibility for aggregate evidence callers. Only memoryMatches are
    // used to build candidates; atomic channels remain infrastructure.
    observation.atomicMatches = [
      ...observation.memoryMatches,
      ...observation.infrastructureMatches,
    ];
    observation.signals = [...new Set(observation.memoryMatches.map((match) => match.id))]
      .sort((left, right) => left.localeCompare(right));
  }

  const representatives = uniqueSourceRepresentatives(ingested.observations);
  const exactGroups = buildGroups(ingested.observations, 'sourceHash', 'exact');
  const structuralGroups = buildGroups(representatives, (observation) => observation.code.structuralHash, 'structural');
  const compositionClusters = completeLinkClusters(representatives, {
    threshold: config.clusterThreshold,
  });
  const timelineArrangements = detectTimelineArrangements(ingested.observations);
  const candidates = buildCandidates({
    observations: ingested.observations,
    compositionClusters,
  });

  const runId = sha256(`${inputText}\n${ALGORITHM_VERSION}\n${ALGORITHM_DIGEST}\n${stableStringify(config)}`).slice(0, 20);
  const manifest = {
    schemaVersion: 2,
    runId,
    algorithmVersion: ALGORITHM_VERSION,
    algorithmDigest: ALGORITHM_DIGEST,
    input: {
      format: 'workspace-jsonl',
      sha256: sha256(inputText),
      jsonlLines: ingested.stats.jsonlLines,
    },
    config,
    humanFeedbackAvailable: false,
    promotionAllowed: false,
    counts: {
      workspaces: ingested.stats.workspaces,
      workspacesWithCompositions: ingested.stats.workspacesWithCompositions,
      tracks: ingested.stats.tracks,
      compositionTracks: ingested.stats.compositionTracks,
      observations: ingested.observations.length,
      validSources: ingested.observations.filter((observation) => observation.code.parseStatus === 'valid').length,
      invalidSources: ingested.observations.filter((observation) => observation.code.parseStatus === 'invalid').length,
      uniqueSources: representatives.length,
      exactDuplicateGroups: exactGroups.filter((group) => group.occurrences > 1).length,
      structuralDuplicateGroups: structuralGroups.filter((group) => group.uniqueSources > 1).length,
      compositionClusters: compositionClusters.length,
      timelineArrangements: timelineArrangements.length,
      infrastructureChannelOccurrences: ingested.observations.reduce(
        (total, observation) => total + observation.infrastructureMatches.length,
        0,
      ),
      connectedMotifOccurrences: ingested.observations.reduce(
        (total, observation) => total + observation.memoryMatches.filter(
          (match) => match.kind === 'unit',
        ).length,
        0,
      ),
      stylisticBehaviourOccurrences: ingested.observations.reduce(
        (total, observation) => total + observation.memoryMatches.filter(
          (match) => match.kind === 'behaviour',
        ).length,
        0,
      ),
      candidates: candidates.length,
      evidenceReadyCandidates: candidates.filter(
        (candidate) => candidate.eligibility.evidenceReady,
      ).length,
      errors: ingested.errors.length,
    },
  };

  return {
    runId,
    manifest,
    observationsPrivate: ingested.observations,
    observations: ingested.observations.map(sanitizeObservation),
    errors: ingested.errors,
    exactGroups,
    structuralGroups,
    compositionClusters,
    timelineArrangements,
    candidates,
    previewIndex: buildPreviewIndex(runId, candidates),
  };
}

export function ingestJsonl(inputText) {
  const observations = [];
  const errors = [];
  const lines = String(inputText ?? '').split(/\r?\n/);
  let workspaces = 0;
  let workspacesWithCompositions = 0;
  let tracks = 0;
  let compositionTracks = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;
    let workspace;
    try {
      workspace = JSON.parse(lines[lineIndex]);
    } catch {
      errors.push({ line: lineIndex + 1, code: 'invalid-json' });
      continue;
    }

    workspaces += 1;
    if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) {
      errors.push({ line: lineIndex + 1, code: 'workspace-not-object' });
      continue;
    }
    if (!Array.isArray(workspace.tracks)) {
      errors.push({ line: lineIndex + 1, code: 'tracks-not-array' });
      continue;
    }
    tracks += workspace.tracks.length;
    const compositions = workspace.tracks.filter((track) => track?.type === 'composition');
    if (compositions.length > 0) workspacesWithCompositions += 1;
    compositionTracks += compositions.length;

    if (compositions.length > 0 && !hasValidWorkspaceTimeline(workspace)) {
      errors.push({ line: lineIndex + 1, code: 'invalid-workspace-timeline' });
      continue;
    }

    workspace.tracks.forEach((track, trackIndex) => {
      if (track?.type !== 'composition') return;
      if (typeof track.source !== 'string' || !track.source.trim()) {
        errors.push({
          line: lineIndex + 1,
          trackIndex,
          code: 'composition-source-missing',
        });
        return;
      }
      if (!hasValidTrackTimeline(track)) {
        errors.push({ line: lineIndex + 1, trackIndex, code: 'invalid-track-timeline' });
        return;
      }
      observations.push(extractObservation({
        workspace,
        workspaceIndex: lineIndex,
        track,
        trackIndex,
      }));
    });
  }

  observations.sort((left, right) => left.observationId.localeCompare(right.observationId));
  return {
    observations,
    errors,
    stats: {
      jsonlLines: lines.filter((line) => line.trim()).length,
      workspaces,
      workspacesWithCompositions,
      tracks,
      compositionTracks,
    },
  };
}

export function sanitizeObservation(observation) {
  const sanitized = structuredClone(observation);
  delete sanitized.private;
  delete sanitized.atomicMatches;
  delete sanitized.memoryMatches;
  delete sanitized.infrastructureMatches;
  sanitized.track.id = `track-${sha256(sanitized.track.id).slice(0, 12)}`;
  sanitized.track.comment = null;
  sanitized.code.parseError = sanitized.code.parseError ? 'parse-error' : null;
  sanitized.code.helpers = sanitized.code.helpers.map((helper) => ({
    ...helper,
    name: safeHelperName(helper.name),
  }));
  sanitized.code.features.calls = sanitizeCountMap(
    sanitized.code.features.calls,
    isSafeCallName,
  );
  sanitized.code.features.jsxTags = sanitizeCountMap(
    sanitized.code.features.jsxTags,
    (name) => SAFE_JSX_TAGS.has(name),
  );
  delete sanitized.code.fingerprintTokens;
  sanitized.code.dependencies = {
    counts: { ...sanitized.code.dependencies.counts },
  };
  return sanitized;
}

const SAFE_HELPER_NAMES = new Map([
  ['ms2f', 'msToFrames'],
  ['mstoframes', 'msToFrames'],
  ['lerp', 'lerp'],
  ['clamp', 'clamp'],
  ['jitter', 'deterministicVariation'],
  ['wobble', 'deterministicVariation'],
  ['boil', 'deterministicVariation'],
  ['pseudorandom', 'deterministicRandom'],
  ['mulberry32', 'deterministicRandom'],
]);

const SAFE_CALL_NAMES = new Set([
  'useCurrentFrame', 'useVideoConfig', 'useEffect', 'useMemo', 'useRef', 'useState', 'useCallback',
  'interpolate', 'spring', 'loadGoogleFont', 'lerp', 'clamp', 'ms2f', 'msToFrames',
  'pseudoRandom', 'mulberry32', 'jitter', 'wobble', 'boil', 'map', 'filter', 'reduce',
]);

const SAFE_MEMBER_CALL_NAMES = new Set([
  'Array.from',
  'Easing.bezier', 'Easing.in', 'Easing.inOut', 'Easing.out',
  'Math.abs', 'Math.ceil', 'Math.cos', 'Math.exp', 'Math.floor', 'Math.imul', 'Math.max',
  'Math.min', 'Math.pow', 'Math.round', 'Math.sin', 'Math.sqrt',
  'canvas.getContext',
  'ctx.clearRect', 'ctx.createRadialGradient', 'ctx.drawImage', 'ctx.fillRect', 'ctx.fillText',
  'ctx.measureText', 'ctx.restore', 'ctx.rotate', 'ctx.save', 'ctx.scale', 'ctx.strokeText',
  'ctx.translate',
  'new:THREE.BufferAttribute', 'new:THREE.BufferGeometry', 'new:THREE.CanvasTexture',
  'new:THREE.ExtrudeGeometry', 'new:THREE.Path', 'new:THREE.ShaderMaterial', 'new:THREE.Shape',
  'new:THREE.SphereGeometry',
  'shape.absarc', 'shape.bezierCurveTo', 'shape.closePath', 'shape.holes.push', 'shape.lineTo',
  'shape.moveTo',
]);

const SAFE_JSX_TAGS = new Set([
  'div', 'span', 'pre', 'style', 'canvas', 'svg', 'path', 'rect', 'circle', 'line', 'g', 'defs',
  'filter', 'feTurbulence', 'feColorMatrix', 'feComponentTransfer', 'feFuncA', 'feMerge',
  'feMergeNode', 'feDisplacementMap', 'AbsoluteFill', 'Sequence', 'Series', 'Img', 'Video',
  'OffthreadVideo', 'Audio', 'AnimatedImage', 'ThreeCanvas', 'group', 'mesh', 'points', 'lineSegments',
  'ambientLight', 'directionalLight', 'pointLight', 'spotLight', 'meshBasicMaterial',
  'meshStandardMaterial', 'pointsMaterial', 'PerspectiveCamera', 'OrthographicCamera',
  'Text', 'Text3D', 'Center', 'Sparkles', 'Float', 'Stars', 'Cloud', 'Environment',
]);

function safeHelperName(name) {
  return SAFE_HELPER_NAMES.get(String(name).toLowerCase()) ?? '_custom';
}

function isSafeCallName(name) {
  return SAFE_CALL_NAMES.has(name) || SAFE_MEMBER_CALL_NAMES.has(name);
}

function sanitizeCountMap(value, isSafe) {
  const result = {};
  let customCount = 0;
  for (const [name, count] of Object.entries(value ?? {})) {
    if (isSafe(name)) result[name] = count;
    else customCount += Number(count) || 0;
  }
  if (customCount > 0) result._custom = customCount;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function buildGroups(observations, keyOrSelector, type) {
  const selector = typeof keyOrSelector === 'function'
    ? keyOrSelector
    : (observation) => observation[keyOrSelector];
  const grouped = new Map();
  for (const observation of observations) {
    const key = selector(observation);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(observation);
  }

  return [...grouped.entries()].map(([fingerprint, members]) => ({
    id: `${type}-${sha256(fingerprint).slice(0, 12)}`,
    fingerprint,
    occurrences: members.length,
    uniqueSources: new Set(members.map((member) => member.sourceHash)).size,
    workspaces: new Set(members.map((member) => member.workspace.index)).size,
    lineages: new Set(members.map((member) => member.track.id)).size,
    observationIds: members.map((member) => member.observationId).sort(),
    sourceHashes: [...new Set(members.map((member) => member.sourceHash))].sort(),
  })).sort((left, right) => (
    right.occurrences - left.occurrences
    || left.fingerprint.localeCompare(right.fingerprint)
  ));
}

function uniqueSourceRepresentatives(observations) {
  const representatives = new Map();
  for (const observation of observations) {
    const previous = representatives.get(observation.sourceHash);
    if (!previous || observation.observationId.localeCompare(previous.observationId) < 0) {
      representatives.set(observation.sourceHash, observation);
    }
  }
  return [...representatives.values()].sort((left, right) => left.sourceHash.localeCompare(right.sourceHash));
}

function buildCandidates({ observations }) {
  const candidates = RULES.flatMap((definition) => {
    const matches = observations.flatMap((observation) => (
      observation.memoryMatches
        .filter((match) => match.id === definition.id)
        .map((match) => ({ observation, match }))
    ));
    const variants = new Map();
    for (const witness of matches) {
      const signature = witness.match.identityFingerprintSha256
        ?? witness.match.temporalFingerprintSha256
        ?? witness.match.styleFingerprintSha256
        ?? witness.match.structuralHash;
      if (!variants.has(signature)) variants.set(signature, []);
      variants.get(signature).push(witness);
    }
    return [...variants.entries()].map(([signature, witnesses]) => (
      candidateFromEvidence(definition, signature, witnesses)
    ));
  });

  return candidates.sort((left, right) => (
    Number(right.eligibility.evidenceReady) - Number(left.eligibility.evidenceReady)
    || right.evidence.workspaces - left.evidence.workspaces
    || right.evidence.occurrences - left.evidence.occurrences
    || left.id.localeCompare(right.id)
  ));
}

function candidateFromEvidence(definition, signature, matches) {
  const isUnit = definition.kind === 'unit';
  const isBehaviour = definition.kind === 'behaviour';
  const observations = [...new Map(matches.map(({ observation }) => (
    [observation.observationId, observation]
  ))).values()];
  const sourceCount = new Set(observations.map((item) => item.sourceHash)).size;
  const implementationCount = new Set(matches.map(
    ({ match }) => match.identityFingerprintSha256 ?? match.structuralHash,
  )).size;
  const workspaceCount = new Set(observations.map((item) => item.workspace.index)).size;
  const occurrenceKeys = new Set(matches.map(({ observation, match }) => (
    `${observation.observationId}:${match.span.start}:${match.span.end}:${match.channel ?? ''}`
  )));
  const independentSupport = new Set(matches.map(({ observation, match }) => (
    `${observation.workspace.index}:${match.identityFingerprintSha256 ?? match.structuralHash}`
  ))).size;
  const spansAvailable = matches.every(({ match }) => (
    Number.isInteger(match.span?.start)
    && Number.isInteger(match.span?.end)
    && match.span.end > match.span.start
  ));
  const coherentBoundaries = matches.every(({ match }) => (
    (isUnit
      && match.occurrenceKind === 'connected-styled-subtree'
      && match.treeEvidence?.connected === true
      && match.treeEvidence.directChildren >= 1)
    || (isBehaviour
      && match.occurrenceKind === 'single-stylistic-channel-law'
      && match.temporalEvidence?.singleChannel === true
      && match.writes?.length === 1)
  ));
  const fingerprintProven = matches.every(
    ({ match }) => match.identityFingerprintProven === true,
  );
  const atomicChannels = [...new Set(matches.flatMap(
    ({ match }) => match.atomicChannels ?? [],
  ))].sort((left, right) => left.localeCompare(right));
  const singleChannel = !isBehaviour || atomicChannels.length === 1;
  const evidenceReady = spansAvailable
    && coherentBoundaries
    && fingerprintProven
    && singleChannel
    && workspaceCount >= 2
    && sourceCount >= 2;
  const blockers = [
    ...(!spansAvailable ? ['connected-boundary-unavailable'] : []),
    ...(!coherentBoundaries ? [isUnit
      ? 'coherent-tree-boundary-unproven'
      : 'stylistic-temporal-boundary-unproven'] : []),
    ...(!fingerprintProven ? [isUnit
      ? 'style-fingerprint-unproven'
      : 'temporal-fingerprint-unproven'] : []),
    ...(!singleChannel ? ['single-channel-boundary-unproven'] : []),
    ...(workspaceCount < 2 ? ['insufficient-independent-workspaces'] : []),
    ...(sourceCount < 2 ? ['insufficient-independent-sources'] : []),
    isUnit ? 'semantic-parameterization-unproven' : 'unit-attachment-contract-unproven',
    'executable-class-not-emitted',
    'reconstruction-not-proven',
    'human-feedback-not-provided',
  ];
  const observationIds = observations.map((item) => item.observationId).sort();
  const sampleOccurrences = matches
    .map(({ observation, match }) => ({
      observationId: observation.observationId,
      span: { ...match.span },
      dependencySpans: (match.dependencySpans ?? []).map((span) => ({ ...span })),
      atomicChannels: [...(match.atomicChannels ?? [])],
      ...(match.treeEvidence ? { treeEvidence: { ...match.treeEvidence } } : {}),
      ...(match.temporalEvidence ? {
        temporalEvidence: {
          ...match.temporalEvidence,
          drivers: [...(match.temporalEvidence.drivers ?? [])],
          shapes: [...(match.temporalEvidence.shapes ?? [])],
        },
      } : {}),
    }))
    .sort((left, right) => (
      left.observationId.localeCompare(right.observationId)
      || left.span.start - right.span.start
      || left.span.end - right.span.end
    ))
    .slice(0, 8);

  return {
    id: `${definition.kind}.${definition.family}.${signature.slice(0, 12)}`,
    detectorId: definition.id,
    family: definition.family,
    kind: definition.kind,
    status: 'observed',
    state: evidenceReady ? 'evidence-ready' : 'inventory',
    feedback: 'unknown',
    trusted: false,
    description: definition.description,
    atomicity: { ...definition.atomicity },
    identity: {
      basis: isUnit ? 'connected-styled-subtree' : 'single-stylistic-channel-law',
      fingerprintSha256: signature,
      ...(isUnit ? { styleFingerprintSha256: signature } : {
        temporalFingerprintSha256: signature,
        channel: atomicChannels[0] ?? null,
      }),
    },
    eligibility: {
      evidenceReady,
      promotionEligible: false,
      blockers: [...new Set(blockers)].sort(),
    },
    extraction: {
      state: spansAvailable && coherentBoundaries
        ? (isUnit ? 'connected-subtree-located' : 'single-channel-law-located')
        : (isUnit ? 'connected-subtree-unavailable' : 'single-channel-law-unavailable'),
      spansAvailable,
      connectedBoundaries: coherentBoundaries,
      occurrences: occurrenceKeys.size,
      spanSource: 'normalized-composition',
    },
    evidence: {
      observations: observations.length,
      occurrences: occurrenceKeys.size,
      independentOccurrences: independentSupport,
      supportBasis: isUnit
        ? 'connected-styled-subtree-variants'
        : 'single-stylistic-channel-law-variants',
      uniqueSources: sourceCount,
      distinctImplementations: implementationCount,
      workspaces: workspaceCount,
      atomicChannels,
      acceptedPositive: 0,
      acceptedNeutral: 0,
      rejected: 0,
      sampleObservationIds: observationIds.slice(0, 8),
      sampleOccurrences,
    },
  };
}

function buildPreviewIndex(runId, candidates) {
  return {
    schemaVersion: 1,
    runId,
    status: 'experimental',
    humanFeedbackAvailable: false,
    promotionAllowed: false,
    warning: 'Discovery evidence is not human approval. Review before creating production memory entries.',
    entries: candidates.map((candidate) => ({
      id: candidate.id,
      detectorId: candidate.detectorId,
      family: candidate.family,
      kind: candidate.kind,
      status: candidate.status,
      state: candidate.state,
      feedback: candidate.feedback,
      trusted: candidate.trusted,
      identity: candidate.identity,
      eligibility: candidate.eligibility,
      extraction: candidate.extraction,
      evidence: candidate.evidence,
      description: candidate.description,
      atomicity: candidate.atomicity,
    })),
  };
}

function hasValidWorkspaceTimeline(workspace) {
  return isPositiveNumber(workspace.width)
    && isPositiveNumber(workspace.height)
    && isPositiveNumber(workspace.fps)
    && isNonNegativeNumber(workspace.length);
}

function hasValidTrackTimeline(track) {
  return isNonNegativeNumber(track.start) && isPositiveNumber(track.length);
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function isNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function computeAlgorithmDigest() {
  const sourceDirectory = fileURLToPath(new URL('.', import.meta.url));
  const sourceFiles = fs.readdirSync(sourceDirectory)
    .filter((name) => name.endsWith('.js'))
    .sort();
  const chunks = sourceFiles.map((name) => `${name}\n${fs.readFileSync(path.join(sourceDirectory, name), 'utf8')}`);
  const schemaDirectory = path.resolve(sourceDirectory, '..', 'schemas');
  if (fs.existsSync(schemaDirectory)) {
    const schemaFiles = fs.readdirSync(schemaDirectory)
      .filter((name) => name.endsWith('.json'))
      .sort();
    chunks.push(...schemaFiles.map((name) => (
      `schemas/${name}\n${fs.readFileSync(path.join(schemaDirectory, name), 'utf8')}`
    )));
  }
  const lockPath = path.resolve(sourceDirectory, '..', 'package-lock.json');
  if (fs.existsSync(lockPath)) chunks.push(`package-lock.json\n${fs.readFileSync(lockPath, 'utf8')}`);
  return sha256(chunks.join('\n---\n')).slice(0, 20);
}
