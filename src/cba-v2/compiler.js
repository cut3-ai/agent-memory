import { analyzeComposition } from './analyzer.js';
import { emitComposition } from './emitter.js';
import { normalizeCbaV2Features } from './features.js';
import { parseCompositionSource } from './parser.js';

export function compileCompositionV2(source, options = {}) {
  const features = normalizeCbaV2Features(options.features);
  const parsed = parseCompositionSource(source);
  const analysis = analyzeComposition(parsed.ast, features);
  const emitted = emitComposition(parsed, analysis, options);
  return {
    program: emitted.program,
    features,
    inventory: analysis.inventory,
    memoryCandidates: {
      units: Object.freeze([]),
      behaviours: Object.freeze(analysis.inventory.behaviours
        .filter((item) => item.implementation === 'library')
        .map((item) => Object.freeze({ kind: item.kind, className: item.className }))),
    },
    escapeHatches: Object.freeze({
      nativeUnits: analysis.inventory.units.length,
      localBehaviours: analysis.inventory.behaviours.filter((item) => item.implementation === 'local').length,
    }),
    warnings: analysis.warnings,
    verification: emitted.verification,
    evaluationPrograms: emitted.evaluationPrograms,
  };
}
