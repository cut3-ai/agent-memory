const ARRANGEMENT_DEFINITIONS = {
  'arrangement.photo-flash-cuts': {
    description: 'Diagnostic evidence that solid-fill plus opacity is reused at media cut boundaries.',
    intents: ['fast photo edit', 'flash transition', 'velocity montage'],
    why: 'At least three image scenes and two short flashes align at adjacent scene boundaries.',
  },
  'arrangement.repeated-ranking-card': {
    description: 'Diagnostic evidence of repeated card.ranking instances; count stays composition data.',
    intents: ['ranking', 'countdown', 'listicle'],
    why: 'At least three ranking-card tracks occur sequentially with no large timeline gap.',
  },
  'arrangement.repeated-timed-word-scatter': {
    description: 'Diagnostic evidence of repeated text.scatter-chunk instances; count stays composition data.',
    intents: ['kinetic dialogue', 'word sequence', 'timed typography'],
    why: 'At least three timed-scatter text tracks occur sequentially with no large timeline gap.',
  },
  'arrangement.repeated-dialogue-card': {
    description: 'Diagnostic evidence of repeated text.dialogue-card instances; count stays composition data.',
    intents: ['dialogue sequence', 'subtitle lane', 'speech cards'],
    why: 'At least three dialogue-box tracks form a sequential timeline lane.',
  },
};

const SIGNAL_ALIASES = {
  fullFrameCover: [
    'unit.media.fullFrameCover',
    'media.FullFrameCover',
    'unit.image.fullFrameCover',
    'unit.media.fullFrameImage',
  ],
  whiteFlash: [
    'overlay.solid-fill',
    'motion.opacity',
    'unit.overlay.whiteFlash',
    'overlay.WhiteFlash',
    'behavior.transition.flashPulse',
    'transition.flashPulse',
    'transition.whiteFlash',
  ],
  rankingCard: [
    'card.ranking',
    'unit.card.rankingHero',
    'card.RankingHero',
    'unit.card.rankingCard',
    'card.RankingCard',
  ],
  timedScatter: [
    'text.scatter-chunk',
    'text.timed-word-scatter',
    'unit.text.timedScatterWords',
    'text.TimedScatterWords',
    'behavior.text.revealTimedGroups',
    'text.revealTimedGroups',
  ],
  dialogueBox: [
    'text.dialogue-card',
    'unit.text.dialogueBox',
    'text.DialogueBox',
    'unit.text.subtitleCard',
  ],
};

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(SIGNAL_ALIASES).map(([name, aliases]) => [
    name,
    new Set(aliases.map(normalizeSignalId)),
  ]),
);

/**
 * Detect timeline arrangements for diagnostics only.
 *
 * Detection never crosses a workspace boundary. An arrangement never becomes
 * a memory entry. Cardinality is composition
 * data; these diagnostics only help reviewers locate repeated atomic blocks.
 */
export function detectTimelineArrangements(observations) {
  const workspaces = groupByWorkspace(Array.isArray(observations) ? observations : []);
  const detected = new Map();

  for (const [workspaceIndex, workspaceObservations] of workspaces) {
    const ordered = [...workspaceObservations].sort(compareTimelineObservations);

    detectPhotoFlashCuts(ordered, workspaceIndex, detected);
    detectSequentialArrangement({
      observations: ordered,
      workspaceIndex,
      detected,
      signal: 'rankingCard',
      arrangementId: 'arrangement.repeated-ranking-card',
    });
    detectSequentialArrangement({
      observations: ordered,
      workspaceIndex,
      detected,
      predicate: isTimedTextChunk,
      arrangementId: 'arrangement.repeated-timed-word-scatter',
    });
    detectSequentialArrangement({
      observations: ordered,
      workspaceIndex,
      detected,
      signal: 'dialogueBox',
      arrangementId: 'arrangement.repeated-dialogue-card',
    });
  }

  return [...detected.values()]
    .map(finalizeDetection)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function detectPhotoFlashCuts(observations, workspaceIndex, detected) {
  const scenes = observations.filter(isFullFrameMediaObservation);
  const flashes = observations.filter((observation) => (
    isFlashObservation(observation)
    && trackLength(observation) > 0
    && trackLength(observation) <= 500
  ));

  if (scenes.length < 3 || flashes.length < 2) return;

  const matchedScenes = new Set();
  const matchedFlashes = new Set();

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = scenes[index - 1];
    const next = scenes[index];
    const previousEnd = trackStart(previous) + trackLength(previous);
    const nextStart = trackStart(next);

    // A scene pair must itself form a plausible cut; overlays elsewhere in the
    // workspace must not accidentally connect unrelated scenes.
    if (Math.abs(previousEnd - nextStart) > 500) continue;

    const flash = flashes.find((candidate) => {
      const flashStart = trackStart(candidate);
      const flashEnd = flashStart + trackLength(candidate);
      return flashStart <= nextStart + 250 && flashEnd >= nextStart - 250;
    });
    if (!flash) continue;

    matchedScenes.add(previous);
    matchedScenes.add(next);
    matchedFlashes.add(flash);
  }

  if (matchedScenes.size < 3 || matchedFlashes.size < 2) return;
  recordDetection(
    detected,
    'arrangement.photo-flash-cuts',
    workspaceIndex,
    [...matchedScenes, ...matchedFlashes],
  );
}

function detectSequentialArrangement({
  observations,
  workspaceIndex,
  detected,
  signal,
  predicate = (observation) => hasSignal(observation, signal),
  arrangementId,
}) {
  const candidates = observations.filter(predicate);
  if (candidates.length < 3) return;

  let run = [];
  for (const candidate of candidates) {
    const previous = run.at(-1);
    const previousEnd = previous ? trackStart(previous) + trackLength(previous) : null;
    const gap = previous ? trackStart(candidate) - previousEnd : 0;
    const maximumOverlap = previous
      ? Math.min(trackLength(previous), trackLength(candidate)) * 0.25
      : 0;

    if (
      previous
      && (trackStart(candidate) <= trackStart(previous) || gap > 500 || gap < -maximumOverlap)
    ) {
      recordSequentialRun(detected, arrangementId, workspaceIndex, run);
      run = [];
    }
    run.push(candidate);
  }
  recordSequentialRun(detected, arrangementId, workspaceIndex, run);
}

function recordSequentialRun(detected, arrangementId, workspaceIndex, run) {
  if (run.length < 3) return;
  recordDetection(detected, arrangementId, workspaceIndex, run);
}

function groupByWorkspace(observations) {
  const grouped = new Map();
  for (const observation of observations) {
    const workspaceIndex = Number(observation?.workspace?.index);
    if (!Number.isFinite(workspaceIndex)) continue;
    if (!grouped.has(workspaceIndex)) grouped.set(workspaceIndex, []);
    grouped.get(workspaceIndex).push(observation);
  }
  return new Map([...grouped.entries()].sort(([left], [right]) => left - right));
}

function recordDetection(detected, arrangementId, workspaceIndex, evidence) {
  const definition = ARRANGEMENT_DEFINITIONS[arrangementId];
  if (!definition) return;

  if (!detected.has(arrangementId)) {
    detected.set(arrangementId, {
      id: arrangementId,
      kind: 'arrangement-diagnostic',
      memoryEligible: false,
      description: definition.description,
      intents: [...definition.intents],
      evidenceObservationIds: new Set(),
      workspaceIndexes: new Set(),
      evidenceOccurrences: [],
      why: definition.why,
    });
  }

  const entry = detected.get(arrangementId);
  entry.workspaceIndexes.add(workspaceIndex);
  const occurrenceIds = [];
  for (const observation of evidence) {
    const observationId = observation?.observationId;
    if (typeof observationId === 'string' && observationId.length > 0) {
      entry.evidenceObservationIds.add(observationId);
      occurrenceIds.push(observationId);
    }
  }
  if (occurrenceIds.length > 0) {
    entry.evidenceOccurrences.push({
      workspaceIndex,
      observationIds: [...new Set(occurrenceIds)].sort(),
    });
  }
}

function finalizeDetection(detection) {
  return {
    id: detection.id,
    kind: detection.kind,
    memoryEligible: detection.memoryEligible,
    description: detection.description,
    intents: [...detection.intents].sort(),
    evidenceObservationIds: [...detection.evidenceObservationIds].sort(),
    workspaceIndexes: [...detection.workspaceIndexes].sort((left, right) => left - right),
    evidenceOccurrences: uniqueOccurrences(detection.evidenceOccurrences),
    why: detection.why,
  };
}

function uniqueOccurrences(occurrences) {
  const unique = new Map();
  for (const occurrence of occurrences) {
    const key = `${occurrence.workspaceIndex}:${occurrence.observationIds.join(',')}`;
    unique.set(key, occurrence);
  }
  return [...unique.values()].sort((left, right) => (
    left.workspaceIndex - right.workspaceIndex
    || left.observationIds.join(',').localeCompare(right.observationIds.join(','))
  ));
}

function isTimedTextChunk(observation) {
  // Ranking cards commonly animate a mapped list of text fragments and can
  // therefore receive the broad TimedScatterWords signal as a side effect.
  if (hasSignal(observation, 'rankingCard')) return false;
  if (hasSignal(observation, 'dialogueBox')) return false;
  return hasSignal(observation, 'timedScatter');
}

function isFullFrameMediaObservation(observation) {
  if (hasSignal(observation, 'fullFrameCover')) return true;
  return (observation?.code?.visualFragments ?? []).some((fragment) => (
    fragment.fullFrame === true && fragment.containsMedia === true
  ));
}

function isFlashObservation(observation) {
  const ids = new Set(signalIds(observation).map(normalizeSignalId));
  const canonicalFill = ids.has(normalizeSignalId('overlay.solid-fill'));
  const canonicalOpacity = ids.has(normalizeSignalId('motion.opacity'));
  if (canonicalFill && canonicalOpacity) return true;

  return [
    'unit.overlay.whiteFlash',
    'overlay.WhiteFlash',
    'behavior.transition.flashPulse',
    'transition.flashPulse',
    'transition.whiteFlash',
  ].some((id) => ids.has(normalizeSignalId(id)));
}

function hasSignal(observation, aliasName) {
  const aliases = NORMALIZED_ALIASES[aliasName];
  if (!aliases) return false;

  return signalIds(observation).some((signalId) => {
    const normalized = normalizeSignalId(signalId);
    if (aliases.has(normalized)) return true;

    // Tolerate a namespace or version prefix while keeping the semantic name
    // exact enough to avoid matching arbitrary prompt/source text.
    return [...aliases].some((alias) => normalized.endsWith(alias));
  });
}

function signalIds(observation) {
  if (!Array.isArray(observation?.signals)) return [];
  return observation.signals.flatMap((signal) => {
    if (typeof signal === 'string') return [signal];
    if (typeof signal?.id === 'string') return [signal.id];
    if (typeof signal?.signalId === 'string') return [signal.signalId];
    return [];
  });
}

function normalizeSignalId(value) {
  return String(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function compareTimelineObservations(left, right) {
  return trackStart(left) - trackStart(right)
    || trackLength(left) - trackLength(right)
    || String(left?.track?.id ?? '').localeCompare(String(right?.track?.id ?? ''))
    || String(left?.observationId ?? '').localeCompare(String(right?.observationId ?? ''));
}

function trackStart(observation) {
  const value = Number(observation?.track?.start);
  return Number.isFinite(value) ? value : 0;
}

function trackLength(observation) {
  const value = Number(observation?.track?.length);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
