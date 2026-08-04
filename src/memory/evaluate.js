import { sha256, stableStringify } from '../lib.js';
import { evaluateReconstructionReceipts } from './reconstruction.js';

/** Mapping is navigation coverage; only verifier receipts can establish 1:1. */
export function evaluateMemoryCandidate(
  census,
  classIndex,
  contractValidation = {},
  options = {},
) {
  const entries = navigationEntries(classIndex);
  const indexedKinds = new Set(entries.map((entry) => entry.kind));
  const unitGroups = census.units ?? [];
  const behaviourGroups = census.behaviours ?? [];
  const totalUnits = sum(unitGroups, 'witnesses');
  const totalBehaviours = sum(behaviourGroups, 'witnesses');
  const mappedUnits = sum(
    unitGroups.filter((entry) => indexedKinds.has(memoryKind(entry))),
    'witnesses',
  );
  const mappedBehaviours = sum(
    behaviourGroups.filter((entry) => indexedKinds.has(memoryKind(entry))),
    'witnesses',
  );
  const reusableKinds = new Set([...unitGroups, ...behaviourGroups]
    .filter((entry) => indexedKinds.has(memoryKind(entry)) && entry.workspaces >= 2)
    .map(memoryKind));
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
    schemaVersion: 4,
    proofLevel: 'static-class-contract-independent-ast-census-and-receipts',
    classContract: {
      valid: contractValidation.valid === true,
      violations: contractViolations.length,
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
    mapping: {
      proof: 'navigation-only',
      mappedUnitWitnesses: mappedUnits,
      unmappedUnitWitnesses: totalUnits - mappedUnits,
      unitKindMappingCoverage: ratio(mappedUnits, totalUnits),
      mappedBehaviourWitnesses: mappedBehaviours,
      unmappedBehaviourWitnesses: totalBehaviours - mappedBehaviours,
      behaviourKindMappingCoverage: ratio(mappedBehaviours, totalBehaviours),
    },
    reuseEvidence: {
      indexedKindsWithMultipleWorkspaceWitnesses: reusableKinds.size,
      unitKinds: [...reusableKinds].filter((kind) => kind.startsWith('unit.')).length,
      behaviourKinds: [...reusableKinds].filter(
        (kind) => kind.startsWith('behaviour.'),
      ).length,
      candidatesAwaitingFeedback: (census.memoryCandidates ?? []).filter(
        (entry) => entry.independentReuse,
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

function residualGroups(groups, indexedKinds) {
  return groups.filter((entry) => !indexedKinds.has(memoryKind(entry))).map((entry) => ({
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
  return denominator === 0 ? 1 : Number((numerator / denominator).toFixed(6));
}

function memoryKind(entry) {
  return entry?.memoryKind ?? entry?.kind ?? null;
}
