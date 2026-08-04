import { analyzeComposition } from './analyzer.js';
import { emitComposition } from './emitter.js';
import { normalizeCbaV2Features } from './features.js';
import { parseCompositionSource } from './parser.js';

const UNIT_KINDS = Object.freeze({
  Audio: 'unit.audio',
  Box: 'unit.box',
  Group: 'unit.group',
  Image: 'unit.image',
  Layer: 'unit.layer',
  Text: 'unit.text',
  TextNode: 'unit.text-node',
  Video: 'unit.video',
});

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
      units: Object.freeze(emitted.rendering.unitClasses.map((className) => Object.freeze({
        className,
        kind: UNIT_KINDS[className],
      }))),
      behaviours: Object.freeze(analysis.inventory.behaviours
        .filter((item) => item.implementation === 'library')
        .map((item) => Object.freeze({ kind: item.kind, className: item.className }))),
    },
    escapeHatches: Object.freeze({
      nativeUnits: analysis.inventory.units.filter((item) => item.implementation === 'native').length,
      localBehaviours: analysis.inventory.behaviours.filter((item) => item.implementation === 'local').length,
      sourceDependentVisualComputations: analysis.inventory.units.reduce(
        (total, item) => total + item.sourceDependentVisualComputations, 0,
      ),
    }),
    warnings: analysis.warnings,
    verification: emitted.verification,
    evaluationPrograms: emitted.evaluationPrograms,
    rendering: emitted.rendering,
  };
}
