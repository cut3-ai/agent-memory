import {
  buildNavigationIndex,
  createNavigationIndex,
  generateNavigationIndex,
  renderNavigationIndex,
  validateNavigationIndex,
  writeNavigationIndex,
} from '../library/index.js';

/** @deprecated Use buildNavigationIndex from src/library/index.js. */
export function buildMemoryIndex(discovery) {
  return buildNavigationIndex(discovery);
}

/** @deprecated Validation is JSON-only and owned by src/library/index.js. */
export function validateMemoryModules(index) {
  return validateNavigationIndex(index);
}

export {
  buildNavigationIndex,
  createNavigationIndex,
  generateNavigationIndex,
  renderNavigationIndex,
  validateNavigationIndex,
  writeNavigationIndex,
};

export {
  createFeedbackReceipt,
  createPromotionGateAuthority,
  createPromotionGateIssuer,
  createPromotionGateVerifier,
  isPromotionGateIssuer,
  isPromotionGateVerifier,
  loadPromotionGateAuthorityFile,
  loadPromotionGateVerifierFile,
  orchestrateMemoryPromotion,
  PROMOTION_GATE_NAMES,
  PROMOTION_GATE_RECEIPT_SCHEMA,
  PROMOTION_GATE_RECEIPT_VERSION,
  PromotionGateConfigurationError,
  verifyPromotionGateReceipt,
} from './promotion.js';

export {
  buildCorpusCensus,
  CORPUS_RULESET_VERSION,
  ingestCompositionTracks,
} from './corpus.js';
export { evaluateMemoryCandidate } from './evaluate.js';
export { MEMORY_ALGORITHM_VERSION, runMemoryPipeline } from './pipeline.js';
