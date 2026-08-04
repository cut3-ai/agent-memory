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
