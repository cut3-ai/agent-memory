const HEART_TARGETS = new WeakMap();
const SCISSOR_TARGETS = new WeakMap();
const INK_TARGETS = new WeakMap();
const SCISSOR_STAGE_TARGETS = new WeakMap();

const HEART_KIND = 'unit.sculptural-3d.heart-hero';
const SCISSOR_KIND = 'unit.sculptural-3d.scissors-hero';
const INK_KIND = 'unit.sculptural-3d.ink-tendril-plane';
const SCISSOR_STAGE_KINDS = Object.freeze({
  'impact-large-glow': 'unit.box',
  'impact-core-glow': 'unit.box',
  'impact-atmosphere': 'unit.box',
  'impact-snap-flash': 'unit.box',
  'impact-copy-group': 'unit.layout',
  'impact-mark': 'unit.text',
  'impact-rule': 'unit.box',
  'minimal-stage': 'unit.sculptural-3d.scissors-stage',
  'minimal-copy-group': 'unit.layout',
  'minimal-mark': 'unit.text',
});

/** Bind one closed heart projection role while its semantic tree is authored. */
export function bindHeartTarget(owner, variant, role) {
  const recipe = String(variant);
  const projectionRole = String(role);
  if (!['slow-pulse', 'fast-pulse'].includes(recipe)
    || projectionRole !== 'heart-scene'
    || owner?.constructor?.kind !== HEART_KIND
    || owner.variant !== recipe) {
    throw new TypeError('Heart target is not an authored semantic projection');
  }
  const binding = Object.freeze({ owner, role: projectionRole, variant: recipe });
  HEART_TARGETS.set(owner, binding);
  return Object.freeze({ owner, role: projectionRole });
}

/** Resolve the immutable heart recipe owned by a registered projection target. */
export function requireHeartTarget(owner) {
  const binding = HEART_TARGETS.get(owner);
  if (!binding) throw new TypeError('HeartPulseOrbit requires an authored heart target');
  return binding;
}

/** Bind one closed scissors projection role while its semantic tree is authored. */
export function bindScissorTarget(owner, variant, role) {
  const recipe = String(variant);
  const projectionRole = String(role);
  if (!['impact', 'minimal'].includes(recipe)
    || projectionRole !== `${recipe}-scene`
    || owner?.constructor?.kind !== SCISSOR_KIND
    || owner.variant !== recipe) {
    throw new TypeError('Scissors target is not an authored semantic projection');
  }
  const binding = Object.freeze({
    owner,
    role: projectionRole,
    variant: recipe,
  });
  SCISSOR_TARGETS.set(owner, binding);
  return Object.freeze({ owner, role: projectionRole });
}

/** Resolve the immutable scissors recipe owned by a registered projection target. */
export function requireScissorTarget(owner) {
  const binding = SCISSOR_TARGETS.get(owner);
  if (!binding) throw new TypeError('ScissorSnapFlight requires an authored scissors target');
  return binding;
}

/** Bind the one authored full-frame ink projection target. */
export function bindInkTarget(owner) {
  if (owner?.constructor?.kind !== INK_KIND
    || owner.capability?.contract !== 'ink-tendril-plane/v1') {
    throw new TypeError('Ink target is not the authored semantic reveal plane');
  }
  const binding = Object.freeze({ owner, role: 'ink-plane' });
  INK_TARGETS.set(owner, binding);
  return Object.freeze({ owner, role: binding.role });
}

/** Fail closed for a generic or otherwise unregistered reveal Unit. */
export function requireInkTarget(owner) {
  const binding = INK_TARGETS.get(owner);
  if (!binding) throw new TypeError('InkTendrilReveal requires the authored ink plane');
  return binding;
}

/** Bind one DOM projection role from the authored full-occurrence scissors stage. */
export function bindScissorStageTarget(owner, variant, role) {
  const recipe = String(variant);
  const projectionRole = String(role);
  if (!['impact', 'minimal'].includes(recipe)
    || !projectionRole.startsWith(recipe)
    || owner?.constructor?.kind !== SCISSOR_STAGE_KINDS[projectionRole]) {
    throw new TypeError('Scissors stage target is not an authored semantic projection');
  }
  const binding = Object.freeze({ owner, role: projectionRole, variant: recipe });
  SCISSOR_STAGE_TARGETS.set(owner, binding);
  return Object.freeze({ owner, role: projectionRole });
}

/** Fail closed for generic DOM primitives outside the authored scissors stage. */
export function requireScissorStageTarget(owner) {
  const binding = SCISSOR_STAGE_TARGETS.get(owner);
  if (!binding) throw new TypeError('ScissorsStageCadence requires an authored stage target');
  return binding;
}
