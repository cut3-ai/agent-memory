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
  canonicalRevisionOutcomeEvent,
  DEFAULT_OUTCOME_GRACE_MS,
  DEFAULT_OUTCOME_WINDOW_MS,
  hashRevisionOutcomeEvent,
  MAXIMUM_OUTCOME_EVENTS,
  MAXIMUM_OUTCOME_WINDOW_MS,
  reduceRevisionOutcome,
  REVISION_OUTCOME_ACTIONS,
  REVISION_OUTCOME_EVENT_SCHEMA_VERSION,
  REVISION_OUTCOME_EVENT_TYPES,
  REVISION_OUTCOME_POLICY_VERSION,
  verifyRevisionOutcomeReceipt,
} from '../feedback/outcome.js';

export {
  createInMemoryOnlineMemoryStore,
  createOnlineMemoryTimeoutScheduler,
  DEFAULT_OBSERVER_OPERATION_LEASE_MS,
  DEFAULT_OBSERVER_RETRY_MS,
  DEFAULT_PUBLICATION_HOLD_MS,
  MAXIMUM_OBSERVER_INPUT_EVENTS,
  MAXIMUM_OBSERVER_TRANSITIONS,
  ONLINE_MEMORY_CALLBACK_SCHEMA_VERSION,
  ONLINE_MEMORY_CANDIDATE_BINDING_SCHEMA_VERSION,
  ONLINE_MEMORY_LIFECYCLE_STATES,
  ONLINE_MEMORY_OBSERVER_SCHEMA_VERSION,
  OnlineMemoryObserver,
} from '../feedback/online-observer.js';

export {
  assertStyleMemory,
  inspectStyleModuleSource,
  readStyleScent,
  STYLE_EVIDENCE_VERSION,
  STYLE_MEMORY_CONTRACT_VERSION,
  STYLE_SCENT_KEYS,
  verifyCueEvidence,
} from './style-contract.js';

export {
  STYLE_MEMORY_AGENT_INSTRUCTION,
  styleMemoryAgentInstruction,
} from './agent-contract.js';

export { retrieveStyleMemories } from './retrieval.js';
