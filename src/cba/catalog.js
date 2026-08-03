export const UNIT_CATALOG = Object.freeze({
  'unit.dom.element': unit('units/dom/element.js', 'dom', 'intrinsic', 7, 'Generic DOM element'),
  'unit.dom.text': unit('units/dom/text.js', 'dom', 'intrinsic', 7, 'Text-bearing DOM element'),
  'unit.react.fragment': unit('units/react/fragment.js', 'react', 'fragment', 7, 'Fragment'),
  'unit.react.local-component': unit('units/react/local-component.js', 'react', 'local', 13, 'Locally declared component'),
  'unit.react.external-component': unit('units/react/external-component.js', 'react', 'external', 13, 'External React component'),
  'unit.control.repeat': unit('units/control/repeat.js', 'react', 'fragment', 11, 'Repeat any number of child units'),
  'unit.control.switch': unit('units/control/switch.js', 'react', 'fragment', 10, 'Choose child units from a control branch'),
  'unit.remotion.layer': unit('units/remotion/layer.js', 'remotion', 'external', 12, 'Full-frame layer'),
  'unit.remotion.timeline-slot': unit('units/remotion/timeline-slot.js', 'remotion', 'external', 12, 'Timeline slot'),
  'unit.media.image': unit('units/media/image.js', 'media', 'external', 12, 'Image'),
  'unit.media.video': unit('units/media/video.js', 'media', 'external', 12, 'Video'),
  'unit.media.audio': unit('units/media/audio.js', 'media', 'external', 12, 'Audio'),
  'unit.svg.root': unit('units/svg/root.js', 'svg', 'intrinsic', 15, 'SVG root'),
  'unit.svg.element': unit('units/svg/element.js', 'svg', 'intrinsic', 15, 'SVG element'),
  'unit.canvas.surface': unit('units/canvas/surface.js', 'canvas', 'intrinsic', 17, 'Canvas surface'),
  'unit.three.scene': unit('units/three/scene.js', 'three', 'external', 16, 'Three.js scene root'),
  'unit.three.element': unit('units/three/element.js', 'three', 'external', 16, 'Three.js scene element'),
});

export const BEHAVIOUR_CATALOG = Object.freeze({
  'behaviour.content.value': behaviour('behaviours/content/value.js', 'content', 10, 'Frame-driven rendered content'),
  'behaviour.css.opacity': behaviour('behaviours/css/opacity.js', 'opacity', 8, 'Opacity'),
  'behaviour.css.property': behaviour('behaviours/css/property.js', 'property', 9, 'CSS property'),
  'behaviour.css.properties': behaviour('behaviours/css/properties.js', 'property', 9, 'Dynamic CSS property set'),
  'behaviour.transform.scale': behaviour('behaviours/transform/scale.js', 'scale', 10, 'Scale'),
  'behaviour.transform.translate': behaviour('behaviours/transform/translate.js', 'translate', 10, 'Translation'),
  'behaviour.transform.rotate': behaviour('behaviours/transform/rotate.js', 'rotate', 10, 'Rotation'),
  'behaviour.transform.transform': behaviour('behaviours/transform/value.js', 'transform', 10, 'Other transform'),
  'behaviour.dom.attribute': behaviour('behaviours/dom/attribute.js', 'attribute', 9, 'DOM attribute'),
  'behaviour.dom.properties': behaviour('behaviours/dom/properties.js', 'attribute', 9, 'Dynamic DOM property set'),
  'behaviour.svg.attribute': behaviour('behaviours/svg/attribute.js', 'svg-attribute', 15, 'SVG attribute'),
  'behaviour.svg.properties': behaviour('behaviours/svg/properties.js', 'svg-attribute', 15, 'Dynamic SVG property set'),
  'behaviour.canvas.property': behaviour('behaviours/canvas/property.js', 'attribute', 17, 'Canvas element property'),
  'behaviour.canvas.draw': behaviour('behaviours/canvas/draw.js', 'canvas-draw', 17, 'Canvas draw lifecycle'),
  'behaviour.three.property': behaviour('behaviours/three/property.js', 'three-property', 16, 'Three.js property or uniform'),
  'behaviour.three.properties': behaviour('behaviours/three/properties.js', 'three-property', 16, 'Dynamic Three.js property set'),
  'behaviour.three.effect': behaviour('behaviours/three/effect.js', 'three-effect', 16, 'Three.js frame mutation lifecycle'),
  'behaviour.lifecycle.effect': behaviour('behaviours/lifecycle/effect.js', 'lifecycle', 14, 'Frame-aware component lifecycle'),
});

export const PASS_DEFINITIONS = Object.freeze([
  pass(1, 'corpus-lock', 'Lock the input hash, composition count, frame count and deterministic ordering.'),
  pass(2, 'parse-and-reachability', 'Start at GeneratedComposition and exclude unreachable helper render trees.'),
  pass(3, 'instrumentation-reversal', 'Undo every inserted wrapper and require exact source AST equality.'),
  pass(4, 'jsx-lowering-reversal', 'Undo Unit calls after JSX lowering and require exact lowered AST equality.'),
  pass(5, 'independent-origin-accounting', 'Compare untouched-AST origins with emitted wrapper origins.'),
  pass(6, 'generated-module-link', 'Resolve and execute generated module imports and validate exports.'),
  pass(7, 'unit-materialization', 'Execute Unit factories and validate type, props, children and attachment.'),
  pass(8, 'frame-dataflow', 'Find frame-dependent sinks independently and measure recall and precision.'),
  pass(9, 'behaviour-atomicity', 'Require separate opacity, scale, translation and rotation channels.'),
  pass(10, 'dynamic-content-and-controls', 'Verify conditions, visibility and frame-driven content.'),
  pass(11, 'loops-and-collections', 'Verify map/loop cardinality, order and repeated children.'),
  pass(12, 'remotion-timeline-and-media', 'Verify layers, timeline slots and media units.'),
  pass(13, 'local-components-and-hooks', 'Verify local component bridges and stable hook execution.'),
  pass(14, 'lifecycle-and-resources', 'Verify effect setup/cleanup ownership and resource references.'),
  pass(15, 'svg', 'Verify SVG structure, defs and dynamic attributes.'),
  pass(16, 'three', 'Verify Three.js structure, properties and mutation effects.'),
  pass(17, 'canvas', 'Verify canvas ownership and ordered 2D command traces.'),
  pass(18, 'exact-factory-deduplication', 'Fold only factories that retain every witness exactly.'),
  pass(19, 'typed-anti-unification-and-loo', 'Evaluate reusable factories with workspace-held-out folds and no feedback leakage.'),
  pass(20, 'frozen-release-evaluation', 'Replay the frozen compiler, compare artifact hashes and apply hard release gates.'),
]);

function unit(module, backend, componentKind, passNumber, description) {
  return { module, backend, componentKind, pass: passNumber, description };
}

function behaviour(module, channel, passNumber, description) {
  return { module, channel, pass: passNumber, description };
}

function pass(number, name, objective) {
  return { number, name, objective };
}

export function renderUnitModule(id, definition) {
  return [
    `export const id = ${JSON.stringify(id)};`,
    `export const backend = ${JSON.stringify(definition.backend)};`,
    `export const description = ${JSON.stringify(definition.description)};`,
    '',
    'export function create(runtime, { type, props = {}, children = [] }) {',
    '  return runtime.makeUnit(type, props, children, {',
    '    factoryId: id,',
    '    backend,',
    `    componentKind: ${JSON.stringify(definition.componentKind)},`,
    '  });',
    '}',
    '',
  ].join('\n');
}

export function renderBehaviourModule(id, definition) {
  return [
    `export const id = ${JSON.stringify(id)};`,
    `export const channel = ${JSON.stringify(definition.channel)};`,
    `export const description = ${JSON.stringify(definition.description)};`,
    '',
    'export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {',
    '  return runtime.behaviour({',
    '    id: instanceId,',
    '    read,',
    '    setup,',
    '    ...descriptor,',
    '    channel,',
    '  });',
    '}',
    '',
  ].join('\n');
}
