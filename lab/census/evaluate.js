import { sha256, stableStringify } from '../../src/lib.js';
import { evaluateReconstructionReceipts } from './reconstruction.js';

/** Mapping is navigation coverage; only verifier receipts can establish 1:1. */
export function evaluateMemoryCandidate(
  census,
  classIndex,
  contractValidation = {},
  options = {},
) {
  const navigation = navigationEntries(classIndex);
  const entries = navigation.filter((entry) => entry.role === 'memory');
  const indexedKinds = new Set(entries.map((entry) => entry.kind));
  const unitGroups = census.units ?? [];
  const behaviourGroups = census.behaviours ?? [];
  const totalUnits = sum(unitGroups, 'witnesses');
  const totalBehaviours = sum(behaviourGroups, 'witnesses');
  const candidateGroups = authenticCandidateGroups(census);
  const candidateUnitGroups = candidateGroups.filter((entry) => entry.kind === 'unit');
  const candidateBehaviourGroups = candidateGroups.filter(
    (entry) => entry.kind === 'behaviour',
  );
  const candidateUnits = sum(candidateUnitGroups, 'witnesses');
  const candidateBehaviours = sum(candidateBehaviourGroups, 'witnesses');
  const infrastructureUnits = sum(
    unitGroups.filter((entry) => entry.infrastructureKind),
    'witnesses',
  );
  const infrastructureBehaviours = sum(
    behaviourGroups.filter((entry) => entry.infrastructureKind),
    'witnesses',
  );
  const mappedUnits = sum(
    candidateUnitGroups.filter((entry) => indexedKinds.has(entry.candidateKind)),
    'witnesses',
  );
  const mappedBehaviours = sum(
    candidateBehaviourGroups.filter((entry) => indexedKinds.has(entry.candidateKind)),
    'witnesses',
  );
  const reusableKinds = new Set(candidateGroups
    .filter((entry) => indexedKinds.has(entry.candidateKind) && entry.workspaces >= 2)
    .map((entry) => entry.candidateKind));
  const receiptEvaluation = evaluateReconstructionReceipts(
    census,
    options.reconstructionReceipts ?? [],
  );
  const reconstruction = (census.compositions?.length ?? 0) === 0
    && Number(census.counts?.compositions ?? 0) > 0
    ? {
      ...receiptEvaluation,
      missingCompositions: Number(census.counts.compositions),
      semanticOneToOneVerified: false,
      pixelOneToOneVerified: false,
      oneToOneVerified: false,
    }
    : receiptEvaluation;
  const sourceDependentVisualComputations = Math.max(
    reconstruction.residuals.sourceDependentVisualComputations,
    reconstruction.receipts === 0 ? totalBehaviours : 0,
  );
  const contractViolations = Array.isArray(contractValidation.violations)
    ? contractValidation.violations
    : [
      ...(contractValidation.source?.violations ?? []),
      ...(contractValidation.imports?.violations ?? []),
    ];
  const body = {
    schemaVersion: 6,
    proofLevel: 'static-class-contract-independent-ast-census-and-receipts',
    classContract: {
      valid: contractValidation.valid === true,
      violations: contractViolations.length,
      indexedInfrastructure: navigation.filter(
        (entry) => entry.role === 'infrastructure',
      ).length,
      indexedUnits: entries.filter((entry) => entry.type === 'unit').length,
      indexedBehaviours: entries.filter((entry) => entry.type === 'behaviour').length,
    },
    corpus: {
      compositions: census.counts.compositions,
      unitWitnesses: totalUnits,
      visualSinks: census.counts.visualSinks,
      atomicBehaviourWitnesses: census.counts.atomicBehaviourWitnesses,
      structuralReclassifications: census.counts.structuralReclassifications ?? 0,
      imperativeResiduals: census.counts.imperativeResiduals ?? 0,
    },
    infrastructure: {
      unitWitnesses: infrastructureUnits,
      behaviourWitnesses: infrastructureBehaviours,
      countedAsMemory: false,
    },
    mapping: {
      proof: 'navigation-only',
      scope: 'stylistic-candidates-to-indexed-memory',
      candidateUnitWitnesses: candidateUnits,
      mappedUnitWitnesses: mappedUnits,
      unmappedUnitWitnesses: candidateUnits - mappedUnits,
      unitKindMappingCoverage: ratio(mappedUnits, candidateUnits),
      candidateBehaviourWitnesses: candidateBehaviours,
      mappedBehaviourWitnesses: mappedBehaviours,
      unmappedBehaviourWitnesses: candidateBehaviours - mappedBehaviours,
      behaviourKindMappingCoverage: ratio(mappedBehaviours, candidateBehaviours),
    },
    reuseEvidence: {
      indexedKindsWithMultipleWorkspaceWitnesses: reusableKinds.size,
      unitKinds: [...reusableKinds].filter((kind) => kind.startsWith('unit.')).length,
      behaviourKinds: [...reusableKinds].filter(
        (kind) => kind.startsWith('behaviour.'),
      ).length,
      motifCandidates: (census.memoryCandidates ?? []).length,
      evidenceReadyMotifs: (census.memoryCandidates ?? []).filter(
        (entry) => entry.eligibility?.evidenceReady === true,
      ).length,
      evidenceReadyUnpromoted: (census.memoryCandidates ?? []).filter(
        (entry) => entry.eligibility?.evidenceReady === true
          && entry.eligibility?.promotionEligible !== true,
      ).length,
    },
    reconstruction,
    residualEvidence: {
      unitCapabilities: residualGroups(unitGroups, indexedKinds),
      behaviourCapabilities: residualGroups(behaviourGroups, indexedKinds),
      sourceDependentVisualComputations:
        sourceDependentVisualComputations,
      functionValuedConfigs: reconstruction.residuals.functionValuedConfigs,
      rawExecutableAstNodes: reconstruction.residuals.rawExecutableAstNodes,
    },
    residuals: {
      sourceDependentVisualComputations,
      functionValuedConfigs: reconstruction.residuals.functionValuedConfigs,
      rawExecutableAstNodes: reconstruction.residuals.rawExecutableAstNodes,
    },
    atomicity: {
      nonVisualHelperClasses: 0,
      combinedBehaviourClasses: 0,
      cardinalitySpecificUnitClasses: 0,
      rejectedNonVisualHelperDeclarations:
        census.counts.rejectedNonVisualHelperDeclarations,
      structuralWritesReclassifiedAwayFromBehaviours:
        census.counts.structuralReclassifications ?? 0,
    },
    release: {
      acceptedForAutomaticPromotion: false,
      reasons: releaseReasons(reconstruction, contractValidation),
    },
  };
  return Object.freeze({
    ...body,
    metricsSha256: sha256(stableStringify(body)),
  });
}

function navigationEntries(index) {
  if (Array.isArray(index?.entries)) return index.entries;
  return [
    ...(index?.units ?? []).map((entry) => ({ ...entry, type: entry.type ?? 'unit' })),
    ...(index?.behaviours ?? []).map((entry) => ({
      ...entry,
      type: entry.type ?? 'behaviour',
    })),
  ];
}

function authenticCandidateGroups(census) {
  const grouped = new Map();
  for (const entry of census.memoryCandidates ?? []) {
    const kind = candidateKind(entry);
    if (!kind) continue;
    grouped.set(kind, {
      ...entry,
      kind: entry.kind ?? (kind.startsWith('behaviour.') ? 'behaviour' : 'unit'),
      candidateKind: kind,
    });
  }
  return [...grouped.values()];
}

function residualGroups(groups, indexedKinds) {
  return groups.filter((entry) => (
    !entry.infrastructureKind && !indexedKinds.has(indexedMemoryKind(entry))
  )).map((entry) => ({
    capability: entry.capability ?? 'unknown',
    status: entry.status ?? 'residual',
    residualCode: entry.residualCode ?? 'class-not-indexed',
    witnesses: Number(entry.witnesses ?? 0),
    workspaces: Number(entry.workspaces ?? 0),
    compositions: Number(entry.compositions ?? 0),
  })).sort((left, right) => (
    left.capability.localeCompare(right.capability)
    || left.residualCode.localeCompare(right.residualCode)
  ));
}

function releaseReasons(reconstruction, contractValidation) {
  const reasons = [];
  if (contractValidation.valid !== true) reasons.push('class-contract-invalid');
  if (!reconstruction.semanticOneToOneVerified) reasons.push('semantic-reconstruction-unproven');
  if (!reconstruction.pixelOneToOneVerified) reasons.push('pixel-reconstruction-unproven');
  reasons.push('human-feedback-not-provided');
  return reasons;
}

function sum(entries, property) {
  return entries.reduce((total, entry) => total + Number(entry[property] ?? 0), 0);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

function candidateKind(entry) {
  if (!entry || entry.infrastructureKind) return null;
  return Object.hasOwn(entry, 'candidateKind') ? entry.candidateKind : null;
}

function indexedMemoryKind(entry) {
  if (!entry || entry.infrastructureKind) return null;
  return Object.hasOwn(entry, 'memoryKind') ? entry.memoryKind : null;
}
