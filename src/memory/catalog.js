/** Stable renderer-neutral primitives available before dataset mining. */
export const CORE_ENTRIES = deepFreeze([
  core('unit.group', 'unit', 'units/group.js', 'Group', { units: 'Unit[]' }),
  core('unit.layer', 'unit', 'units/layer.js', 'Layer', { unit: 'Unit', appearance: 'data?' }),
  core('unit.surface', 'unit', 'units/surface.js', 'Surface', { width: 'number', height: 'number', background: 'string?' }),
  core('unit.text', 'unit', 'units/text.js', 'Text', { value: 'string', typography: 'data?' }),
  core('unit.image', 'unit', 'units/image.js', 'Image', { asset: 'string', options: 'data?' }),
  core('unit.video', 'unit', 'units/video.js', 'Video', { asset: 'string', options: 'data?' }),
  core('unit.audio', 'unit', 'units/audio.js', 'Audio', { asset: 'string', options: 'data?' }),
  core('unit.sprite', 'unit', 'units/sprite.js', 'Sprite', { asset: 'string', options: 'data?' }),
  core('unit.sequence', 'unit', 'units/sequence.js', 'Sequence', { unit: 'Unit', timing: 'data?' }),
  core('unit.repeat', 'unit', 'units/repeat.js', 'Repeat', { units: 'Unit[]' }),
  core('unit.switch', 'unit', 'units/switch.js', 'Switch', { selector: 'signal', cases: 'Record<string,Unit>' }),
  core('unit.svg', 'unit', 'units/svg.js', 'Svg', { units: 'Unit[]', options: 'data?' }),
  core('unit.canvas', 'unit', 'units/canvas.js', 'Canvas', { options: 'data?', units: 'Unit[]' }),
  core('unit.three-scene', 'unit', 'units/three/scene.js', 'ThreeScene', { units: 'Unit[]' }),
  core('behaviour.blur', 'behaviour', 'behaviours/blur.js', 'Blur', { value: 'plain|Tween|Keyframes|Spring|Oscillation' }, ['filter.blur']),
  core('behaviour.text-reveal', 'behaviour', 'behaviours/text-reveal.js', 'TextReveal', { options: 'data?' }, ['text']),
  core('behaviour.visible-during', 'behaviour', 'behaviours/visible-during.js', 'VisibleDuring', { options: 'data?' }, ['visible']),
]);

/** Dataset-backed entries that may enter feedback review after hard gates. */
export const MEMORY_ENTRIES = deepFreeze([
  entry('motion.opacity', 'behaviour.opacity', 'behaviour', 'behaviours/opacity.js', 'Opacity', {
    parameters: { value: 'plain|Tween|Keyframes|Spring|Oscillation' },
    writes: ['opacity'],
  }),
  entry('motion.scale', 'behaviour.scale', 'behaviour', 'behaviours/scale.js', 'Scale', {
    parameters: { value: 'plain|Tween|Keyframes|Spring|Oscillation' },
    writes: ['transform.scale'],
  }),
  entry('motion.translate', 'behaviour.translate', 'behaviour', 'behaviours/translate.js', 'Translate', {
    parameters: { value: 'plain|Tween|Keyframes|Spring|Oscillation', unit: 'px|%' },
    writes: ['transform.translate'],
  }),
  entry('motion.rotate', 'behaviour.rotate', 'behaviour', 'behaviours/rotate.js', 'Rotate', {
    parameters: { value: 'plain|Tween|Keyframes|Spring|Oscillation', unit: 'deg|rad' },
    writes: ['transform.rotate'],
  }),
  entry('overlay.solid-fill', 'unit.solid-fill', 'unit', 'units/solid-fill.js', 'SolidFill', {
    parameters: { color: 'string', opacity: 'number?' },
  }),
  entry('overlay.vignette', 'unit.vignette', 'unit', 'units/vignette.js', 'Vignette', {
    parameters: { color: 'string?', strength: 'number?', radius: 'number?' },
  }),
]);

/* Detector-only hypotheses have no importable module. A future implementation
 * stays in transient staging until reconstruction, feedback and hard gates
 * promote its exact source revision. */
export const MEMORY_CANDIDATES = deepFreeze([
  entry('text.scatter-chunk', 'unit.scatter-text', 'unit', null, null, {
    parameters: { text: 'string', x: 'number', y: 'number', typography: 'data?' },
  }),
  entry('text.dialogue-card', 'unit.dialogue-card', 'unit', null, null, {
    parameters: { speaker: 'string?', text: 'string', portrait: 'asset?', presentation: 'data?' },
  }),
  entry('card.ranking', 'unit.ranking-card', 'unit', null, null, {
    parameters: { rank: 'number|string', title: 'string', subtitle: 'string?', image: 'asset?' },
  }),
]);

/*
 * Detector evidence and a reusable class are deliberately different things.
 * The item detectors are useful corpus probes, but their current heuristics do
 * not prove that a match is one card/item rather than an enclosing sequence.
 * Keeping this policy outside MEMORY_ENTRIES prevents heuristic matches from
 * being treated as reusable-memory proof.
 */
const PROMOTION_POLICIES = deepFreeze({
  'motion.opacity': reviewable('atomic-visual-write'),
  'motion.scale': reviewable('atomic-visual-write'),
  'motion.translate': reviewable('atomic-visual-write'),
  'motion.rotate': reviewable('atomic-visual-write'),
  'overlay.solid-fill': reviewable('single-render-boundary'),
  'overlay.vignette': reviewable('single-render-boundary'),
  'text.scatter-chunk': candidateOnly('single-item-boundary-not-proven'),
  'text.dialogue-card': candidateOnly('single-item-boundary-not-proven'),
  'card.ranking': candidateOnly('single-item-boundary-not-proven'),
});

const ALL_DETECTOR_ENTRIES = deepFreeze([...MEMORY_ENTRIES, ...MEMORY_CANDIDATES]);

validateCatalog(ALL_DETECTOR_ENTRIES, PROMOTION_POLICIES);

const BY_DETECTOR = new Map(ALL_DETECTOR_ENTRIES.map((value) => [value.detectorId, value]));

export function entryForDetector(detectorId) {
  return BY_DETECTOR.get(detectorId) ?? null;
}

export function promotionPolicyForDetector(detectorId) {
  return PROMOTION_POLICIES[detectorId] ?? null;
}

function entry(detectorId, kind, entryType, module, exportName, contract) {
  return {
    detectorId,
    kind,
    entryType,
    module,
    export: exportName,
    parameters: contract.parameters,
    ...(contract.writes ? { writes: contract.writes } : {}),
  };
}

function core(kind, entryType, module, exportName, parameters, writes) {
  return {
    kind,
    entryType,
    module,
    export: exportName,
    parameters,
    ...(writes ? { writes } : {}),
  };
}

function reviewable(evidenceKind) {
  return {
    evidenceKind,
    reviewable: true,
    blocker: null,
  };
}

function candidateOnly(blocker) {
  return {
    evidenceKind: 'heuristic-render-fragment',
    reviewable: false,
    blocker,
  };
}

function validateCatalog(entries, policies) {
  const detectorIds = new Set();
  const kinds = new Set();
  for (const value of entries) {
    if (detectorIds.has(value.detectorId)) {
      throw new Error(`Duplicate detector id: ${value.detectorId}`);
    }
    if (kinds.has(value.kind)) throw new Error(`Duplicate memory kind: ${value.kind}`);
    detectorIds.add(value.detectorId);
    kinds.add(value.kind);

    if (!['unit', 'behaviour'].includes(value.entryType)) {
      throw new Error(`Invalid entry type for ${value.detectorId}`);
    }
    if (value.entryType === 'behaviour') {
      if (!Array.isArray(value.writes) || value.writes.length !== 1) {
        throw new Error(`Behaviour ${value.kind} must declare exactly one visual write`);
      }
    } else if (Object.hasOwn(value, 'writes')) {
      throw new Error(`Unit ${value.kind} must not declare Behaviour writes`);
    }
    if (!policies[value.detectorId]) {
      throw new Error(`Missing promotion policy for ${value.detectorId}`);
    }
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}
