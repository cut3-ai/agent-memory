import { sha256, stableStringify, uniqueSorted } from '../lib.js';
import {
  MEMORY_CANDIDATES,
  MEMORY_ENTRIES,
  promotionPolicyForDetector,
} from './catalog.js';

const DETECTOR_ENTRIES = Object.freeze([...MEMORY_ENTRIES, ...MEMORY_CANDIDATES]);

/**
 * Aggregate detector receipts without turning them into promotion receipts.
 *
 * The returned value contains counts and hashes only. In particular it never
 * copies source spans, user values, prompts, URLs, transcript data or detector
 * prose into a public artifact.
 */
export function aggregateMemoryEvidence(observations) {
  const source = Array.isArray(observations) ? observations : [];
  return DETECTOR_ENTRIES.map((entry) => evidenceForEntry(entry, source));
}

function evidenceForEntry(entry, observations) {
  const policy = promotionPolicyForDetector(entry.detectorId);
  const witnesses = uniqueWitnesses(observations.flatMap((observation) => (
    (observation.atomicMatches ?? [])
      .filter((match) => match?.id === entry.detectorId)
      .map((match) => witness(entry, observation, match))
  )));
  const accepted = witnesses.filter((value) => value.atomicBoundary);
  const workspaceKeys = uniqueSorted(accepted.map((value) => value.workspaceKey));
  const compositionKeys = uniqueSorted(accepted.map((value) => value.compositionKey));
  const structuralHashes = uniqueSorted(accepted.map((value) => value.structuralHash));
  const variantHashes = uniqueSorted(accepted.map((value) => value.variantHash));
  const structures = structuralSupport(accepted);
  const independentlyRepeatedStructures = structures.filter((value) => value.workspaces >= 2);
  const independentReuseObserved = independentlyRepeatedStructures.length > 0;
  const decision = promotionDecision({
    accepted: accepted.length,
    independentReuseObserved,
    policy,
  });
  const witnessDigestInput = accepted.map((value) => ({
    compositionKey: value.compositionKey,
    structuralHash: value.structuralHash,
    variantHash: value.variantHash,
    workspaceKey: value.workspaceKey,
  })).sort(compareRecords);
  const body = {
    schemaVersion: 2,
    kind: entry.kind,
    detectorId: entry.detectorId,
    entryType: entry.entryType,
    evidenceKind: policy.evidenceKind,
    detectorEvidence: {
      occurrences: witnesses.length,
      atomicOccurrences: accepted.length,
      rejectedOccurrences: witnesses.length - accepted.length,
      compositions: compositionKeys.length,
      workspaces: workspaceKeys.length,
      structuralVariants: structuralHashes.length,
      valueVariants: variantHashes.length,
      independentlyRepeatedStructuralVariants: independentlyRepeatedStructures.length,
      independentReuseObserved,
    },
    reconstruction: {
      executableClassInstances: 0,
      oneToOneWitnessesVerified: 0,
      proven: false,
    },
    promotion: {
      reviewableDetectorEvidence: policy.reviewable,
      status: decision.status,
      promoted: false,
      automatic: false,
      blockers: decision.blockers,
    },
    humanFeedback: 'not-provided',
    witnessSetSha256: sha256(stableStringify(witnessDigestInput)),
  };
  return Object.freeze({
    ...body,
    evidenceSha256: sha256(stableStringify(body)),
  });
}

function witness(entry, observation, match) {
  const compositionKey = sha256(`composition:${String(observation?.observationId ?? '')}`)
    .slice(0, 24);
  const workspaceKey = sha256(`workspace:${String(observation?.workspace?.index ?? '')}`)
    .slice(0, 16);
  const structuralHash = safeHash(match?.structuralHash);
  const variantHash = safeHash(match?.variantHash ?? match?.structuralHash);
  return {
    compositionKey,
    workspaceKey,
    structuralHash,
    variantHash,
    atomicBoundary: atomicBoundaryMatches(entry, match)
      && structuralHash !== null
      && validSpan(match?.span),
    occurrenceKey: sha256(stableStringify({
      compositionKey,
      detectorId: entry.detectorId,
      end: integerOrNull(match?.span?.end),
      start: integerOrNull(match?.span?.start),
      structuralHash,
      variantHash,
    })),
  };
}

function atomicBoundaryMatches(entry, match) {
  if (entry.entryType === 'behaviour') {
    const expectedChannel = entry.writes[0].replace(/^style\./u, '');
    return match?.occurrenceKind === 'channel-write'
      && typeof match.channel === 'string'
      && match.channel === expectedChannel;
  }
  return match?.occurrenceKind === 'renderable-fragment';
}

function structuralSupport(witnesses) {
  const groups = new Map();
  for (const value of witnesses) {
    if (!groups.has(value.structuralHash)) groups.set(value.structuralHash, new Set());
    groups.get(value.structuralHash).add(value.workspaceKey);
  }
  return [...groups.entries()].map(([structuralHash, workspaces]) => ({
    structuralHash,
    workspaces: workspaces.size,
  })).sort((left, right) => (
    right.workspaces - left.workspaces
    || left.structuralHash.localeCompare(right.structuralHash)
  ));
}

function promotionDecision({ accepted, independentReuseObserved, policy }) {
  const blockers = ['executable-reconstruction-not-proven', 'human-feedback-not-provided'];
  if (!policy.reviewable) {
    blockers.unshift(policy.blocker);
    return { status: 'candidate-only-unproven-boundary', blockers };
  }
  if (accepted === 0) {
    blockers.unshift('no-atomic-witness');
    return { status: 'no-atomic-evidence', blockers };
  }
  if (!independentReuseObserved) {
    blockers.unshift('no-structural-variant-repeated-across-workspaces');
    return { status: 'insufficient-independent-reuse', blockers };
  }
  return { status: 'evidence-only-awaiting-reconstruction', blockers };
}

function uniqueWitnesses(witnesses) {
  return [...new Map(witnesses.map((value) => [value.occurrenceKey, value])).values()]
    .sort((left, right) => left.occurrenceKey.localeCompare(right.occurrenceKey));
}

function safeHash(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return /^[a-f0-9]{16,128}$/iu.test(value)
    ? value.toLowerCase()
    : sha256(`structural:${value}`);
}

function validSpan(span) {
  return Number.isInteger(span?.start)
    && Number.isInteger(span?.end)
    && span.start >= 0
    && span.end > span.start;
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function compareRecords(left, right) {
  return stableStringify(left).localeCompare(stableStringify(right));
}
