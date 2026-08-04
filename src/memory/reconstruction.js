import { sha256, stableStringify } from '../lib.js';

/**
 * Aggregate receipts produced by an external class-graph emitter/verifier.
 * A receipt contains counts and hashes only; executable code is never accepted.
 */
export function evaluateReconstructionReceipts(census, input = []) {
  if (!Array.isArray(input)) throw new TypeError('reconstruction receipts must be an array');
  const compositions = new Map((census.compositions ?? []).map((item) => [
    item.compositionKey,
    item,
  ]));
  const receipts = new Map();
  for (const value of input) {
    const receipt = normalizeReceipt(value, compositions);
    if (receipts.has(receipt.compositionKey)) {
      throw new TypeError('duplicate reconstruction receipt');
    }
    receipts.set(receipt.compositionKey, receipt);
  }

  const ordered = [...receipts.values()].sort((left, right) => (
    left.compositionKey.localeCompare(right.compositionKey)
  ));
  const missing = [...compositions.keys()]
    .filter((key) => !receipts.has(key))
    .sort((left, right) => left.localeCompare(right));
  const semanticExact = ordered.filter((receipt) => receipt.semanticExact).length;
  const pixelExact = ordered.filter((receipt) => receipt.pixelExact).length;
  const expectedFrames = sum(census.compositions ?? [], 'frameCount');
  const missingRecords = missing.map((key) => compositions.get(key));
  const hasCompositions = compositions.size > 0;
  const body = {
    schemaVersion: 1,
    receipts: ordered.length,
    missingCompositions: missing.length,
    missingSetSha256: sha256(stableStringify(missing)),
    emittedCompositionModules: ordered.filter((item) => item.moduleEmitted).length,
    importedCompositionModules: ordered.filter((item) => item.moduleImported).length,
    graphExactCompositions: ordered.filter((item) => item.graphExact).length,
    semanticExactCompositions: semanticExact,
    pixelExactCompositions: pixelExact,
    frames: {
      expected: expectedFrames,
      semanticCompared: sumNested(ordered, 'semanticFrames', 'compared'),
      semanticMatched: sumNested(ordered, 'semanticFrames', 'matched'),
      pixelCompared: sumNested(ordered, 'pixelFrames', 'compared'),
      pixelMatched: sumNested(ordered, 'pixelFrames', 'matched'),
    },
    residuals: {
      unitWitnesses: sumNested(ordered, 'residuals', 'unitWitnesses')
        + sum(missingRecords, 'unitWitnesses'),
      behaviourWitnesses: sumNested(ordered, 'residuals', 'behaviourWitnesses')
        + sum(missingRecords, 'behaviourWitnesses'),
      sourceDependentVisualComputations: sumNested(
        ordered,
        'residuals',
        'sourceDependentVisualComputations',
      ) + sum(missingRecords, 'behaviourWitnesses'),
      functionValuedConfigs: sumNested(ordered, 'residuals', 'functionValuedConfigs'),
      rawExecutableAstNodes: sumNested(ordered, 'residuals', 'rawExecutableAstNodes'),
    },
    semanticOneToOneVerified: hasCompositions
      && missing.length === 0
      && semanticExact === compositions.size,
    pixelOneToOneVerified: hasCompositions
      && missing.length === 0
      && pixelExact === compositions.size,
    oneToOneVerified: hasCompositions
      && missing.length === 0
      && semanticExact === compositions.size
      && pixelExact === compositions.size,
    receiptSetSha256: sha256(stableStringify(ordered)),
  };
  return Object.freeze({
    ...body,
    reconstructionSha256: sha256(stableStringify(body)),
  });
}

function normalizeReceipt(value, compositions) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('reconstruction receipt must be an object');
  }
  const composition = compositions.get(value.compositionKey);
  if (!composition) throw new TypeError('unknown reconstruction composition');
  const semanticFrames = normalizeFrames(value.semanticFrames, composition.frameCount);
  const pixelFrames = normalizeFrames(value.pixelFrames, composition.frameCount, true);
  const residuals = normalizeResiduals(value.residuals, composition);
  const moduleEmitted = value.moduleEmitted === true;
  const moduleImported = moduleEmitted && value.moduleImported === true;
  const graphExact = moduleImported && value.graphExact === true;
  const noResiduals = Object.values(residuals).every((count) => count === 0);
  const semanticExact = graphExact
    && noResiduals
    && semanticFrames.compared === composition.frameCount
    && semanticFrames.matched === composition.frameCount;
  const pixelExact = semanticExact
    && pixelFrames.compared === composition.frameCount
    && pixelFrames.matched === composition.frameCount;
  return {
    compositionKey: composition.compositionKey,
    receiptSha256: requireHash(value.receiptSha256),
    moduleEmitted,
    moduleImported,
    graphExact,
    semanticFrames,
    pixelFrames,
    residuals,
    semanticExact,
    pixelExact,
  };
}

function normalizeFrames(value, expected, optional = false) {
  if (value === undefined && optional) return { compared: 0, matched: 0 };
  const source = value && typeof value === 'object' ? value : {};
  const compared = nonNegativeInteger(source.compared ?? 0, 'compared frames');
  const matched = nonNegativeInteger(source.matched ?? 0, 'matched frames');
  if (matched > compared || compared > expected) {
    throw new RangeError('frame receipt counts exceed expected bounds');
  }
  return { compared, matched };
}

function normalizeResiduals(value, composition) {
  const source = value && typeof value === 'object' ? value : {};
  const output = {
    unitWitnesses: nonNegativeInteger(
      source.unitWitnesses ?? composition.residualUnitWitnesses,
      'residual unit witnesses',
    ),
    behaviourWitnesses: nonNegativeInteger(
      source.behaviourWitnesses ?? composition.residualBehaviourWitnesses,
      'residual behaviour witnesses',
    ),
    sourceDependentVisualComputations: nonNegativeInteger(
      source.sourceDependentVisualComputations ?? composition.behaviourWitnesses,
      'source-dependent visual computations',
    ),
    functionValuedConfigs: nonNegativeInteger(
      source.functionValuedConfigs ?? 0,
      'function-valued configs',
    ),
    rawExecutableAstNodes: nonNegativeInteger(
      source.rawExecutableAstNodes ?? 0,
      'raw executable AST nodes',
    ),
  };
  if (output.unitWitnesses > composition.unitWitnesses
      || output.behaviourWitnesses > composition.behaviourWitnesses
      || output.sourceDependentVisualComputations > composition.behaviourWitnesses) {
    throw new RangeError('residual receipt counts exceed census witnesses');
  }
  return output;
}

function requireHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError('receiptSha256 must be a lowercase SHA-256');
  }
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function sum(values, key) {
  return values.reduce((total, value) => total + Number(value[key] ?? 0), 0);
}

function sumNested(values, owner, key) {
  return values.reduce((total, value) => total + Number(value[owner]?.[key] ?? 0), 0);
}
