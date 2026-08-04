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

const BEHAVIOUR_KINDS = Object.freeze({
  Opacity: 'behaviour.opacity',
  Rotate: 'behaviour.rotate',
  Scale: 'behaviour.scale',
  Translate: 'behaviour.translate',
});

export function compileCompositionV2(source, options = {}) {
  const features = normalizeCbaV2Features(options.features);
  const parsed = parseCompositionSource(source);
  const analysis = analyzeComposition(parsed.ast, features);
  const emitted = emitComposition(parsed, analysis, options);
  const foundationUnitClasses = [...new Set([
    ...emitted.rendering.unitClasses,
    ...(emitted.rendering.supportUnitClasses ?? []),
  ])].sort();
  const foundationUnits = Object.freeze(foundationUnitClasses.map((className) => (
    Object.freeze({ className, kind: UNIT_KINDS[className] })
  )));
  const foundationBehaviours = Object.freeze(analysis.inventory.behaviours
    .filter((item) => item.implementation === 'library')
    .map((item) => Object.freeze({
      kind: BEHAVIOUR_KINDS[item.className] ?? `behaviour.${item.kind}`,
      className: item.className,
    })));
  return {
    program: emitted.program,
    features,
    inventory: analysis.inventory,
    foundationDependencies: Object.freeze({
      units: foundationUnits,
      behaviours: foundationBehaviours,
    }),
    // The compiler can prove that these mechanics reconstruct the source, but
    // reconstruction alone does not make them stylistic memory.  Authentic
    // memory candidates are mined as connected motifs and promoted separately.
    memoryCandidates: Object.freeze({
      units: Object.freeze([]),
      behaviours: Object.freeze([]),
    }),
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
