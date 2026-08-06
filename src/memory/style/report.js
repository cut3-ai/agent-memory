import { deepFreeze, unique } from './ast.js';

export const STYLE_MEMORY_CONTRACT_VERSION = 'style-memory-v3';

export function emptyFacts() {
  return {
    internalUnitNodes: 0,
    treeDepth: 0,
    authoredVisualDecisions: 0,
    styleAxes: { composition: 0, typography: 0, palette: 0, rendering: 0, motion: 0 },
    behaviourAttachments: 0,
    frameDriven: false,
    writtenChannel: null,
  };
}

export function styleReport(value) {
  const violations = unique(value.violations ?? []);
  return deepFreeze({
    contractVersion: STYLE_MEMORY_CONTRACT_VERSION,
    ok: violations.length === 0,
    kind: value.kind ?? null,
    type: value.type ?? null,
    exportName: value.exportName ?? null,
    scent: value.scent ?? null,
    evidence: value.evidence ?? null,
    facts: value.facts ?? emptyFacts(),
    violations,
  });
}
