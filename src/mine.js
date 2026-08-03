import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RULES, detectMatches } from './detectors.js';
import { extractObservation } from './extract.js';
import { round, sha256, stableStringify } from './lib.js';
import { completeLinkClusters } from './similarity.js';
import { detectTimelineArrangements } from './timeline.js';

export const ALGORITHM_VERSION = 'memory-miner-v1.1.0-atomic';
export const ALGORITHM_DIGEST = computeAlgorithmDigest();

export function mineDataset(inputText, options = {}) {
  const config = {
    clusterThreshold: Number(options.clusterThreshold ?? 0.85),
  };
  const ingested = ingestJsonl(inputText);

  for (const observation of ingested.observations) {
    observation.atomicMatches = detectMatches(observation);
    observation.signals = [...new Set(observation.atomicMatches.map((match) => match.id))]
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
    schemaVersion: 1,
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
      candidates: candidates.length,
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
  const ruleCandidates = RULES.flatMap((definition) => {
    const evidence = observations.filter((observation) => observation.signals.includes(definition.id));
    const matches = evidence.flatMap((observation) => (
      observation.atomicMatches
        .filter((match) => match.id === definition.id)
        .map((match) => ({ observation, match }))
    ));
    return matches.length > 0
      ? [candidateFromEvidence(definition, evidence, matches)]
      : [];
  });

  const maturityRank = { strong: 0, promising: 1, experimental: 2 };
  return ruleCandidates.sort((left, right) => (
    maturityRank[left.maturity] - maturityRank[right.maturity]
    || right.confidence.score - left.confidence.score
    || left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
  ));
}

function candidateFromEvidence(definition, evidence, matches) {
  const sourceCount = new Set(evidence.map((item) => item.sourceHash)).size;
  const implementationCount = new Set(matches.map(({ match }) => match.variantHash ?? match.structuralHash)).size;
  const workspaceCount = new Set(evidence.map((item) => item.workspace.index)).size;
  const occurrenceKeys = new Set(matches.map(({ observation, match }) => (
    `${observation.observationId}:${match.span.start}:${match.span.end}:${match.channel ?? ''}`
  )));
  const independentSupport = new Set(matches.map(({ observation, match }) => (
    `${observation.workspace.index}:${match.variantHash ?? match.structuralHash}`
  ))).size;
  const validCount = evidence.filter((item) => item.code.parseStatus === 'valid').length;
  const variantCounts = countValues(matches.map(({ match }) => match.variantHash ?? match.structuralHash));
  const dominantVariantCount = Math.max(0, ...Object.values(variantCounts));
  const localCohesion = matches.length === 0 ? 0 : dominantVariantCount / matches.length;
  const spansAvailable = matches.every(({ match }) => (
    Number.isInteger(match.span?.start)
    && Number.isInteger(match.span?.end)
    && match.span.end > match.span.start
  ));
  const extractionState = spansAvailable
    ? 'atomic-occurrences-located'
    : 'recognized-not-extracted';
  const baseExtractability = spansAvailable ? 0.8 : 0.35;
  const components = {
    support: Math.min(1, Math.log2(1 + independentSupport) / Math.log2(25)),
    diversity: Math.min(1, implementationCount / 10),
    crossWorkspace: Math.min(1, workspaceCount / 5),
    cohesion: localCohesion,
    extractability: evidence.length === 0 ? 0 : baseExtractability * (validCount / evidence.length),
  };
  const penalties = [];
  if (evidence.some((item) => item.code.features.hasMathRandom || item.code.features.hasNondeterministicClock)) {
    penalties.push({ code: 'nondeterministic-runtime', value: 0.15 });
  }
  const penalty = penalties.reduce((sum, item) => sum + item.value, 0);
  const score = round(Math.max(0,
    0.25 * components.support
    + 0.15 * components.diversity
    + 0.15 * components.crossWorkspace
    + 0.30 * components.cohesion
    + 0.15 * components.extractability
    - penalty,
  ), 4);
  const tier = score >= 0.78
      && independentSupport >= 3
      && workspaceCount >= 2
      && penalties.length === 0
      && extractionState === 'extracted'
    ? 'strong-review'
    : score >= 0.58 && independentSupport >= 2 && workspaceCount >= 2
      ? 'review'
      : 'inventory-only';
  const maturity = tier === 'strong-review' ? 'strong' : tier === 'review' ? 'promising' : 'experimental';
  const observationIds = evidence.map((item) => item.observationId).sort();
  const sampleOccurrences = matches
    .map(({ observation, match }) => ({
      observationId: observation.observationId,
      span: { ...match.span },
      dependencySpans: (match.dependencySpans ?? []).map((span) => ({ ...span })),
      ...(match.channel ? { channel: match.channel } : {}),
    }))
    .sort((left, right) => (
      left.observationId.localeCompare(right.observationId)
      || left.span.start - right.span.start
      || left.span.end - right.span.end
    ))
    .slice(0, 8);

  return {
    id: definition.id,
    kind: definition.kind,
    status: 'observed',
    state: 'suggested',
    feedback: 'unknown',
    trusted: false,
    maturity,
    description: definition.description,
    intents: [...definition.intents].sort(),
    atomicity: { ...definition.atomicity },
    ...(definition.kind === 'unit' ? {
      propsSchema: definition.propsSchema,
      providesCapabilities: [...definition.providesCapabilities],
    } : {
      configSchema: definition.configSchema,
      requiresCapabilities: [...definition.requiresCapabilities],
      writes: [...definition.writes],
    }),
    confidence: {
      score,
      tier,
      meaning: 'Repeatability and extractability evidence; not visual quality or human approval.',
      components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value, 4)])),
      penalties,
    },
    extraction: {
      state: extractionState,
      spansAvailable,
      localCohesion: round(localCohesion, 4),
      atomicOccurrences: occurrenceKeys.size,
      spanSource: 'normalized-composition',
    },
    evidence: {
      observations: evidence.length,
      independentOccurrences: independentSupport,
      supportBasis: 'local-ast-occurrences',
      uniqueSources: sourceCount,
      distinctImplementations: implementationCount,
      workspaces: workspaceCount,
      acceptedPositive: 0,
      acceptedNeutral: 0,
      rejected: 0,
      sampleObservationIds: observationIds.slice(0, 8),
      sampleOccurrences,
    },
  };
}

function countValues(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
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
      kind: candidate.kind,
      status: candidate.status,
      state: candidate.state,
      feedback: candidate.feedback,
      trusted: candidate.trusted,
      maturity: candidate.maturity,
      confidence: candidate.confidence,
      extraction: candidate.extraction,
      evidence: candidate.evidence,
      description: candidate.description,
      intents: candidate.intents,
      atomicity: candidate.atomicity,
      ...(candidate.kind === 'unit' ? {
        propsSchema: candidate.propsSchema,
        providesCapabilities: candidate.providesCapabilities,
      } : {
        configSchema: candidate.configSchema,
        requiresCapabilities: candidate.requiresCapabilities,
        writes: candidate.writes,
      }),
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
