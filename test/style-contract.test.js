import assert from 'node:assert/strict';
import test from 'node:test';

import { styleMemoryAgentInstruction } from '../src/memory/agent-contract.js';
import {
  inspectStyleModuleSource,
  readStyleScent,
  verifyCueEvidence,
} from '../src/memory/style-contract.js';

const UNIT_SCENT = `Object.freeze({
  family: 'signal-editorial',
  composition: ['asymmetric-stack', 'edge-anchored'],
  typography: ['condensed-uppercase', 'oversized-copy'],
  palette: ['ink-black', 'paper-white', 'signal-red'],
  rendering: ['dry-marker-outline', 'paper-grain'],
  motion: ['two-beat-snap'],
})`;

const BEHAVIOUR_SCENT = `Object.freeze({
  family: 'signal-editorial',
  composition: [],
  typography: [],
  palette: [],
  rendering: [],
  motion: ['two-beat-snap'],
})`;

const UNIT_SOURCE = [
  "import { Unit } from '../core/Unit.js';",
  "import { EditorialSnap } from '../behaviours/editorial-snap.js';",
  "import { Box } from './box.js';",
  "import { CompositionPivot } from './composition-pivot.js';",
  "import { Group } from './group.js';",
  "import { Layer } from './layer.js';",
  "import { SolidFill } from './solid-fill.js';",
  'export class SignalEditorialCard extends Unit {',
  "  static kind = 'unit.signal-editorial-card';",
  `  static scent = ${UNIT_SCENT};`,
  '  constructor(content) {',
  "    const copy = new Box(content, { fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' });",
  "    const marker = new SolidFill({ color: '#ff3b30' });",
  "    const row = new Group(marker, copy);",
  "    const panel = new Box(row, { display: 'flex', gap: 24, padding: 48, width: 820, backgroundColor: '#111111', backgroundImage: 'radial-gradient(#f5f1e822 0.7px, transparent 0.7px)', border: '6px solid #f5f1e8', boxShadow: '14px 14px 0 #ff3b30' });",
  "    const stage = new Layer(panel, { position: 'absolute', left: 96, top: 144, overflow: 'hidden' });",
  '    const pivot = new CompositionPivot(stage, { x: 144, y: 240 });',
  '    pivot.add(new EditorialSnap(pivot));',
  '    super(pivot);',
  '  }',
  '}',
  '',
].join('\n');

const VECTOR_UNIT_SOURCE = UNIT_SOURCE
  .replace(
    "import { SolidFill } from './solid-fill.js';",
    "import { SolidFill } from './solid-fill.js';\nimport { VectorPath } from './vector-path.js';",
  )
  .replace(
    "rendering: ['dry-marker-outline', 'paper-grain']",
    "rendering: ['angular-linework', 'authored-vector-drawing']",
  )
  .replace(
    "const marker = new SolidFill({ color: '#ff3b30' });",
    "const marker = new VectorPath([{ move: [0, 0] }, { line: [128, 12] }, { line: [96, 84] }, { close: true }], { fill: '#ff3b30', nonScalingStroke: true, roundCaps: true, roundJoins: true, stroke: '#f5f1e8', strokeWidth: 6 });",
  );

const BEHAVIOUR_SOURCE = [
  "import { Behaviour } from '../core/Behaviour.js';",
  "import { writeTransform } from './shared.js';",
  'export class EditorialSnap extends Behaviour {',
  "  static kind = 'behaviour.editorial-snap';",
  `  static scent = ${BEHAVIOUR_SCENT};`,
  '  constructor(unit) { super(unit); }',
  '  onFrame(context) {',
  '    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));',
  '    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;',
  "    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
  '  }',
  '}',
  '',
].join('\n');

function inspectUnitSource(moduleSource, dependencyModules = {
  'behaviours/editorial-snap.js': BEHAVIOUR_SOURCE,
}) {
  return inspectStyleModuleSource({
    moduleSource,
    sourceFile: 'units/signal-editorial-card.js',
    kind: 'unit.signal-editorial-card',
    type: 'unit',
    exportName: 'SignalEditorialCard',
    dependencyModules,
  });
}

function inspectBehaviourSource(moduleSource) {
  return inspectStyleModuleSource({
    moduleSource,
    sourceFile: 'behaviours/editorial-snap.js',
    kind: 'behaviour.editorial-snap',
    type: 'behaviour',
    exportName: 'EditorialSnap',
  });
}

test('accepts a concrete nested style Unit with five authored axes', () => {
  const report = inspectStyleModuleSource({
    moduleSource: UNIT_SOURCE,
    sourceFile: 'units/signal-editorial-card.js',
    kind: 'unit.signal-editorial-card',
    type: 'unit',
    exportName: 'SignalEditorialCard',
    dependencyModules: {
      'behaviours/editorial-snap.js': BEHAVIOUR_SOURCE,
    },
  });
  assert.equal(report.ok, true, report.violations.join(', '));
  assert.equal(report.facts.internalUnitNodes, 6);
  assert.ok(report.facts.treeDepth >= 4);
  assert.equal(report.facts.behaviourAttachments, 1);
  assert.equal(report.facts.styleAxes.composition, 8);
  assert.equal(report.facts.styleAxes.rendering, 3);
  assert.equal(report.scent.family, 'signal-editorial');
  assert.equal(report.evidence.version, 1);
  assert.equal(report.evidence.type, 'unit');
  assert.match(report.evidence.fingerprintSha256, /^[a-f0-9]{64}$/u);
  assert.match(report.evidence.cueEvidenceSha256, /^[a-f0-9]{64}$/u);
  assert.ok(report.evidence.descriptors.composition.includes('asymmetric-stack'));
  assert.ok(report.evidence.descriptors.typography.includes('condensed-uppercase'));
  assert.ok(report.evidence.descriptors.typography.includes('font-barlow-condensed'));
  assert.ok(report.evidence.descriptors.palette.includes('signal-red'));
  assert.ok(report.evidence.descriptors.palette.includes('color-ff3b30'));
  assert.ok(report.evidence.descriptors.rendering.includes('paper-grain'));
  assert.ok(report.evidence.descriptors.motion.includes('two-beat-snap'));
  assert.equal(verifyCueEvidence(report.scent, report.evidence), true);
  assert.deepEqual(Object.keys(report.scent), [
    'family', 'composition', 'typography', 'palette', 'rendering', 'motion',
  ]);
});

test('accepts one fixed nonlinear one-channel style Behaviour', () => {
  const report = inspectBehaviourSource(BEHAVIOUR_SOURCE);
  assert.equal(report.ok, true, report.violations.join(', '));
  assert.equal(report.facts.frameDriven, true);
  assert.equal(report.facts.writtenChannel, 'transform:scale');
  assert.deepEqual(report.scent.composition, []);
  assert.equal(report.evidence.type, 'behaviour');
  assert.ok(report.evidence.descriptors.motion.includes('two-beat-snap'));
  assert.equal(verifyCueEvidence(report.scent, report.evidence), true);
});

test('accepts authored vector subtrees and binds exact geometry and stroke constants', () => {
  const report = inspectUnitSource(VECTOR_UNIT_SOURCE);
  assert.equal(report.ok, true, report.violations.join(', '));
  assert.ok(report.evidence.descriptors.rendering.includes('authored-vector-drawing'));
  assert.ok(report.evidence.descriptors.rendering.includes('angular-linework'));
  assert.ok(report.evidence.descriptors.rendering.includes('closed-vector-shape'));
  assert.ok(report.evidence.descriptors.rendering.includes('rounded-stroke'));
  assert.ok(report.evidence.descriptors.rendering.includes('non-scaling-stroke'));
  assert.ok(report.evidence.descriptors.rendering.includes('stroke-width-6'));
  const geometry = report.evidence.descriptors.rendering.find(
    (descriptor) => descriptor.startsWith('vector-geometry-'),
  );
  assert.match(geometry, /^vector-geometry-[a-f0-9]{12}$/u);

  const revisedGeometry = inspectUnitSource(VECTOR_UNIT_SOURCE.replace(
    '{ line: [128, 12] }',
    '{ line: [129, 12] }',
  ));
  const revisedStroke = inspectUnitSource(VECTOR_UNIT_SOURCE.replace(
    'strokeWidth: 6',
    'strokeWidth: 7',
  ));
  assert.equal(revisedGeometry.ok, true, revisedGeometry.violations.join(', '));
  assert.equal(revisedStroke.ok, true, revisedStroke.violations.join(', '));
  assert.notEqual(revisedGeometry.evidence.fingerprintSha256, report.evidence.fingerprintSha256);
  assert.notEqual(
    revisedGeometry.evidence.descriptors.rendering.find(
      (descriptor) => descriptor.startsWith('vector-geometry-'),
    ),
    geometry,
  );
  assert.notEqual(revisedStroke.evidence.fingerprintSha256, report.evidence.fingerprintSha256);
  assert.ok(revisedStroke.evidence.descriptors.rendering.includes('stroke-width-7'));
});

test('rejects callback, prose, URL, and external-library vector wrappers', () => {
  for (const replacement of [
    "() => [{ move: [0, 0] }, { line: [128, 12] }]",
    "'private transcript drawing'",
    "'https://example.test/private.svg'",
  ]) {
    const source = VECTOR_UNIT_SOURCE.replace(
      "[{ move: [0, 0] }, { line: [128, 12] }, { line: [96, 84] }, { close: true }]",
      replacement,
    );
    const report = inspectUnitSource(source);
    assert.equal(report.ok, false);
    assert.ok(report.violations.includes('vector-path-grammar-invalid'));
  }

  const external = VECTOR_UNIT_SOURCE
    .replace(
      "import { Unit } from '../core/Unit.js';",
      "import { Unit } from '../core/Unit.js';\nimport { drawPath } from 'vector-library';",
    )
    .replace(
      "[{ move: [0, 0] }, { line: [128, 12] }, { line: [96, 84] }, { close: true }]",
      'drawPath()',
    );
  const report = inspectUnitSource(external);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('external-library-import'));
  assert.ok(report.violations.includes('vector-path-grammar-invalid'));
});

test('rejects no-op and default declarations as authored style evidence', () => {
  const noOp = UNIT_SOURCE
    .replace(
      "{ fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' }",
      "{ fontFamily: '', fontSize: 0, fontWeight: 400, lineHeight: 'normal', letterSpacing: 0, textTransform: 'none', color: 'transparent' }",
    )
    .replace("{ color: '#ff3b30' }", "{ color: 'transparent' }")
    .replace(
      "{ display: 'flex', gap: 24, padding: 48, width: 820, backgroundColor: '#111111', backgroundImage: 'radial-gradient(#f5f1e822 0.7px, transparent 0.7px)', border: '6px solid #f5f1e8', boxShadow: '14px 14px 0 #ff3b30' }",
      "{ display: 'block', gap: 0, padding: 0, width: 'auto', backgroundColor: 'transparent', backgroundImage: 'none', border: '0px solid #ff3b30', boxShadow: '0 0 0 transparent' }",
    )
    .replace(
      "{ position: 'absolute', left: 96, top: 144, overflow: 'hidden' }",
      "{ position: 'static', left: 0, top: 0, overflow: 'visible' }",
    );
  const report = inspectUnitSource(noOp);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('style-decision-no-op'));
  assert.ok(report.violations.includes('style-axis-typography-missing'));
  assert.ok(report.violations.includes('style-axis-palette-missing'));
  assert.ok(report.violations.includes('style-axis-rendering-missing'));
  assert.ok(report.violations.includes('style-scent-composition-unsupported'));
  assert.equal(report.facts.authoredVisualDecisions, 1);
});

test('does not let duplicate CSS keys inflate authored style coverage', () => {
  const duplicates = UNIT_SOURCE.replace(
    "{ fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' }",
    "{ fontSize: 48, fontSize: 56, fontSize: 64, fontSize: 72, color: '#f5f1e8' }",
  );
  const report = inspectUnitSource(duplicates);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('style-boundary-duplicate-key'));
  assert.ok(report.violations.includes('style-axis-typography-under-authored'));
  assert.equal(report.facts.styleAxes.typography, 1);
});

test('binds scent cues exactly to derived descriptors and rejects shared-word spoofing', () => {
  const spoofed = UNIT_SOURCE.replace("'signal-red'", "'signal-blue'");
  const report = inspectUnitSource(spoofed);
  assert.equal(report.ok, false);
  assert.ok(report.evidence.descriptors.palette.includes('signal-red'));
  assert.ok(!report.evidence.descriptors.palette.includes('signal-blue'));
  assert.ok(report.violations.includes('style-scent-palette-unsupported'));
  assert.equal(verifyCueEvidence(report.scent, report.evidence), false);

  const implementationDetail = UNIT_SOURCE.replace("'dry-marker-outline'", "'uses-border'");
  const detailReport = inspectUnitSource(implementationDetail);
  assert.ok(detailReport.evidence.descriptors.rendering.includes('uses-border'));
  assert.ok(detailReport.violations.includes('style-scent-rendering-unsupported'));
});

test('produces a stable semantic fingerprint and changes it with authored source values', () => {
  const first = inspectUnitSource(UNIT_SOURCE);
  const reformatted = inspectUnitSource(UNIT_SOURCE.replaceAll('\n', '\n\n'));
  const changed = inspectUnitSource(UNIT_SOURCE.replace('fontSize: 92', 'fontSize: 104'));
  const changedTree = inspectUnitSource(UNIT_SOURCE.replace('const copy = new Box(', 'const copy = new Layer('));
  assert.equal(first.ok, true, first.violations.join(', '));
  assert.equal(reformatted.ok, true, reformatted.violations.join(', '));
  assert.equal(changed.ok, true, changed.violations.join(', '));
  assert.equal(changedTree.ok, true, changedTree.violations.join(', '));
  assert.equal(first.evidence.fingerprintSha256, reformatted.evidence.fingerprintSha256);
  assert.notEqual(first.evidence.fingerprintSha256, changed.evidence.fingerprintSha256);
  assert.notEqual(first.evidence.fingerprintSha256, changedTree.evidence.fingerprintSha256);
});

test('requires standalone Behaviour scents to leave non-motion axes empty', () => {
  const contaminated = BEHAVIOUR_SOURCE.replace(
    'composition: [],',
    "composition: ['edge-anchored'],",
  );
  const report = inspectBehaviourSource(contaminated);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('behaviour-scent-composition-must-be-empty'));
});

test('ties frame dependence and nonlinear authorship to the one visual sink', () => {
  const unrelatedNonlinearity = BEHAVIOUR_SOURCE.replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    const decoration = Math.sin(context.frame);\n    const opacity = Math.max(0, Math.min(1, context.frame / 12));\n    this.unit.opacity = opacity;",
  );
  const nonlinearReport = inspectBehaviourSource(unrelatedNonlinearity);
  assert.equal(nonlinearReport.ok, false);
  assert.equal(nonlinearReport.facts.frameDriven, true);
  assert.ok(nonlinearReport.violations.includes('authored-temporal-law-required'));

  const unrelatedFrame = BEHAVIOUR_SOURCE.replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    const clock = context.frame;\n    const opacity = Math.pow(0.6, 2);\n    this.unit.opacity = opacity;",
  );
  const frameReport = inspectBehaviourSource(unrelatedFrame);
  assert.equal(frameReport.ok, false);
  assert.equal(frameReport.facts.frameDriven, false);
  assert.ok(frameReport.violations.includes('behaviour-not-frame-driven'));

  const oneOperation = BEHAVIOUR_SOURCE.replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    const opacity = Math.sin(context.frame);\n    this.unit.opacity = opacity;",
  );
  assert.ok(inspectBehaviourSource(oneOperation).violations.includes('authored-temporal-law-required'));

  const propertyNameSpoof = BEHAVIOUR_SOURCE.replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    const frame = Math.pow(context.frame / 6, 2) + 3;\n    const fake = { frame: 1 };\n    const opacity = Math.pow(fake.frame / 2, 2) + 0.1;\n    this.unit.opacity = opacity;",
  );
  assert.ok(inspectBehaviourSource(propertyNameSpoof).violations.includes('behaviour-not-frame-driven'));
});

test('rejects multiple sinks and direct transform, scale, or timer mutation', () => {
  const twoSinks = BEHAVIOUR_SOURCE.replace(
    "    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    this.unit.opacity = snap;\n    this.unit.visible = snap > 0.2;",
  );
  assert.ok(inspectBehaviourSource(twoSinks).violations.includes('behaviour-single-visual-sink-required'));

  for (const channel of ['scale', 'timer', 'transform']) {
    const direct = BEHAVIOUR_SOURCE.replace(
      "    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
      `    this.unit.${channel} = snap;`,
    );
    const report = inspectBehaviourSource(direct);
    assert.equal(report.ok, false, channel);
    assert.ok(report.violations.includes('direct-unit-channel-forbidden'), channel);
    assert.ok(report.violations.includes('unsupported-visual-sink'), channel);
  }
});

test('only canonical shared helpers may write transform or filter', () => {
  const fakeHelper = BEHAVIOUR_SOURCE
    .replace("import { writeTransform } from './shared.js';", '')
    .replace('export class EditorialSnap', 'function writeTransform(unit, name, value) { unit[name] = value; }\nexport class EditorialSnap');
  const report = inspectBehaviourSource(fakeHelper);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('unsupported-visual-sink'));
  assert.ok(report.violations.includes('behaviour-single-visual-sink-required'));
  assert.ok(report.violations.includes('top-level-declaration-forbidden'));
});

test('rejects a scented CSS wrapper and open style parameter', () => {
  const thin = [
    "import { Unit } from '../core/Unit.js';",
    "import { Box } from './box.js';",
    'export class Wrapper extends Unit {',
    "  static kind = 'unit.wrapper';",
    `  static scent = ${UNIT_SCENT};`,
    '  constructor(style) { super(new Box(style)); }',
    '}',
  ].join('\n');
  const report = inspectStyleModuleSource({
    moduleSource: thin,
    sourceFile: 'units/wrapper.js',
    exportName: 'Wrapper',
    type: 'unit',
  });
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('semantic-unit-slot-required'));
  assert.ok(report.violations.includes('open-style-input'));
  assert.ok(report.violations.includes('unit-tree-too-small'));
});

test('rejects external libraries and configurable channel forwarding', () => {
  const generic = [
    "import easing from 'some-animation-library';",
    "import { Behaviour } from '../core/Behaviour.js';",
    'export class Generic extends Behaviour {',
    "  static kind = 'behaviour.generic';",
    `  static scent = ${BEHAVIOUR_SCENT};`,
    '  constructor(unit, value) { super(unit); this.value = value; }',
    '  onFrame(context) { this.unit.style = easing(context.frame, this.value); }',
    '}',
  ].join('\n');
  const report = inspectStyleModuleSource({
    moduleSource: generic,
    sourceFile: 'behaviours/generic.js',
    exportName: 'Generic',
    type: 'behaviour',
  });
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('external-library-import'));
  assert.ok(report.violations.includes('semantic-unit-slot-required'));
  assert.ok(report.violations.includes('unsupported-visual-sink'));
});

test('attaching a generic foundation animation does not satisfy the motion style axis', () => {
  const genericMotion = UNIT_SOURCE
    .replace("import { EditorialSnap } from '../behaviours/editorial-snap.js';", "import { Opacity } from '../behaviours/opacity.js';")
    .replace('new EditorialSnap(pivot)', 'new Opacity(pivot)');
  const report = inspectStyleModuleSource({
    moduleSource: genericMotion,
    sourceFile: 'units/signal-editorial-card.js',
    exportName: 'SignalEditorialCard',
  });
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('foundation-motion-is-not-style-law'));
  assert.ok(report.violations.includes('style-axis-motion-missing'));
});

test('counts style decisions only at direct style-boundary properties', () => {
  const nested = UNIT_SOURCE.replace(
    "    const copy = new Box(content, { fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' });",
    "    const copy = new Box(content, { metadata: { fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, lineHeight: 0.9, letterSpacing: -2, textTransform: 'uppercase', color: '#f5f1e8' } });",
  );
  const report = inspectUnitSource(nested);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('nested-style-metadata'));
  assert.ok(report.violations.includes('style-axis-typography-missing'));

  const groupMetadata = UNIT_SOURCE.replace(
    'const row = new Group(marker, copy);',
    "const row = new Group(marker, copy, { fontFamily: 'Fake Evidence', boxShadow: 'none' });",
  );
  const groupReport = inspectUnitSource(groupMetadata);
  assert.ok(groupReport.violations.includes('invalid-foundation-config-argument'));
  assert.equal(groupReport.facts.styleAxes.typography, 6);
  assert.equal(groupReport.facts.styleAxes.rendering, 3);
});

test('rejects style values controlled by the semantic content slot', () => {
  const controlled = UNIT_SOURCE.replace("color: '#f5f1e8'", 'color: content.accent');
  const report = inspectUnitSource(controlled);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('semantic-slot-controls-style'));
});

test('requires composition-space pivots instead of local CSS transform origins', () => {
  const localPivot = UNIT_SOURCE.replace(
    "overflow: 'hidden'",
    "overflow: 'hidden', transformOrigin: '48px 96px'",
  );
  const report = inspectUnitSource(localPivot);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('composition-pivot-must-be-absolute'));

  const transformOnLocalOwner = UNIT_SOURCE.replace(
    'const pivot = new CompositionPivot(stage, { x: 144, y: 240 });',
    "const pivot = new Box(stage, { position: 'absolute', left: 12, top: 12 });",
  );
  const ownerReport = inspectUnitSource(transformOnLocalOwner);
  assert.equal(ownerReport.ok, false);
  assert.ok(ownerReport.violations.includes(
    'transform-behaviour-requires-composition-pivot',
  ));
});

test('proves one-parent branching trees and exactly one semantic slot', () => {
  const duplicateSlot = UNIT_SOURCE.replace(
    'const row = new Group(marker, copy);',
    'const row = new Group(content, marker, copy);',
  );
  assert.ok(inspectUnitSource(duplicateSlot).violations.includes('semantic-slot-multiple'));

  const twoParents = UNIT_SOURCE
    .replace(
      'const panel = new Box(row,',
      'const duplicate = new Group(row, copy);\n    const panel = new Box(duplicate,',
    );
  const parentReport = inspectUnitSource(twoParents);
  assert.equal(parentReport.ok, false);
  assert.ok(parentReport.violations.includes('unit-tree-multiple-parent'));

  const chain = [
    "import { Unit } from '../core/Unit.js';",
    "import { EditorialSnap } from '../behaviours/editorial-snap.js';",
    "import { Box } from './box.js';",
    'export class SignalEditorialCard extends Unit {',
    "  static kind = 'unit.signal-editorial-card';",
    `  static scent = ${UNIT_SCENT};`,
    '  constructor(content) {',
    "    const copy = new Box(content, { fontFamily: 'Barlow Condensed', fontSize: 92, fontWeight: 800, letterSpacing: -2, color: '#f5f1e8' });",
    "    const ink = new Box(copy, { backgroundColor: '#111111', border: '6px solid #f5f1e8', boxShadow: '14px 14px 0 #ff3b30' });",
    "    const panel = new Box(ink, { display: 'flex', gap: 24, padding: 48, width: 820 });",
    "    const mount = new Box(panel, { position: 'absolute', left: 96, top: 144 });",
    "    const stage = new Box(mount, { overflow: 'hidden' });",
    '    stage.add(new EditorialSnap(stage));',
    '    super(stage);',
    '  }',
    '}',
  ].join('\n');
  const chainReport = inspectUnitSource(chain);
  assert.equal(chainReport.facts.internalUnitNodes, 5);
  assert.ok(chainReport.violations.includes('unit-tree-branch-required'));

  const conditionalSuper = UNIT_SOURCE.replace(
    'super(pivot);',
    'if (content) { super(pivot); } else { super(pivot); }',
  );
  const conditionalReport = inspectUnitSource(conditionalSuper);
  assert.ok(conditionalReport.violations.includes('unit-single-super-required'));
  assert.ok(conditionalReport.violations.includes('unit-tree-must-be-unconditional'));
});

test('motion requires a reachable owner.add(new Behaviour(owner)) attachment', () => {
  const unattached = UNIT_SOURCE.replace(
    'pivot.add(new EditorialSnap(pivot));',
    'const motion = new EditorialSnap(pivot);',
  );
  const unattachedReport = inspectUnitSource(unattached);
  assert.ok(unattachedReport.violations.includes('unattached-behaviour'));
  assert.ok(unattachedReport.violations.includes('style-axis-motion-missing'));

  const wrongOwner = UNIT_SOURCE.replace(
    'pivot.add(new EditorialSnap(pivot));',
    'pivot.add(new EditorialSnap(panel));',
  );
  const ownerReport = inspectUnitSource(wrongOwner);
  assert.ok(ownerReport.violations.includes('unattached-behaviour'));
  assert.ok(ownerReport.violations.includes('style-axis-motion-missing'));
});

test('recursively rejects missing or thin attached Behaviour modules', () => {
  const missing = inspectUnitSource(UNIT_SOURCE, {});
  assert.ok(missing.violations.includes('attached-behaviour-source-missing'));
  assert.ok(missing.violations.includes('style-axis-motion-missing'));

  const thinBehaviour = BEHAVIOUR_SOURCE.replace(
    "    const beat = Math.max(0, Math.min(1, (context.frame - 6) / 12));\n    const snap = beat < 0.72 ? Math.pow(beat / 0.72, 2) * 1.08 : 1.08 - ((beat - 0.72) / 0.28) * 0.08;\n    writeTransform(this.unit, 'scale', { x: snap, y: snap });",
    "    const opacity = Math.max(0, Math.min(1, context.frame / 12));\n    this.unit.opacity = opacity;",
  );
  const report = inspectUnitSource(UNIT_SOURCE, new Map([
    ['behaviours/editorial-snap.js', thinBehaviour],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('attached-behaviour-contract-failed'));
  assert.ok(report.violations.includes('style-axis-motion-missing'));
});

test('rejects module side effects, re-exports, drivers, and barrel imports', () => {
  const sideEffect = `${BEHAVIOUR_SOURCE}\nregisterStyle(EditorialSnap);`;
  assert.ok(inspectBehaviourSource(sideEffect).violations.includes('top-level-side-effect'));

  const forbiddenImports = BEHAVIOUR_SOURCE.replace(
    "import { Behaviour } from '../core/Behaviour.js';",
    "export * from '../drivers/remotion.js';\nimport { primitives } from '../units/index.js';\nimport { Behaviour } from '../core/Behaviour.js';",
  );
  const report = inspectBehaviourSource(forbiddenImports);
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('module-reexport'));
  assert.ok(report.violations.includes('driver-or-barrel-import'));

  const extraClass = BEHAVIOUR_SOURCE.replace(
    'export class EditorialSnap',
    "export class OtherStyle {}\nexport class EditorialSnap",
  );
  assert.ok(inspectBehaviourSource(extraClass).violations.includes('style-module-single-exported-class'));
});

test('scent vocabulary cannot contain raw prose, URLs, or arbitrary fields', () => {
  const invalid = UNIT_SOURCE
    .replace("family: 'signal-editorial'", "family: 'https://private.example/style'")
    .replace("motion: ['two-beat-snap']", "motion: ['two beat snap'], prompt: ['raw-user-text']");
  const report = inspectStyleModuleSource({
    moduleSource: invalid,
    sourceFile: 'units/signal-editorial-card.js',
    exportName: 'SignalEditorialCard',
  });
  assert.equal(report.ok, false);
  assert.ok(report.violations.includes('style-scent-family'));
  assert.ok(report.violations.includes('style-scent-shape'));
  assert.ok(report.violations.includes('style-scent-motion'));

  const identifyingFamily = inspectStyleModuleSource({
    moduleSource: UNIT_SOURCE.replace("family: 'signal-editorial'", "family: 'customer-acme'"),
    sourceFile: 'units/signal-editorial-card.js',
    exportName: 'SignalEditorialCard',
  });
  assert.ok(identifyingFamily.violations.includes('style-scent-family'));
});

test('agent instruction distinguishes same style from the same scene', () => {
  const instruction = styleMemoryAgentInstruction();
  assert.match(instruction, /Save the reusable art direction, not the scene narrative/u);
  assert.match(instruction, /static ESM import/u);
  assert.match(instruction, /Silence.*never approve/u);
  assert.match(instruction, /exactly match a descriptor/u);
  assert.match(instruction, /VectorPath.*literal numeric segment objects/u);
  assert.match(instruction, /transparent colors.*not authored style decisions/u);
  assert.doesNotMatch(instruction, /confidence|factory registry|dynamic import/iu);
});

test('readStyleScent is reusable by static index discovery', async () => {
  const { parse } = await import('@babel/parser');
  const ast = parse(UNIT_SOURCE, { sourceType: 'module', plugins: ['classProperties'] });
  const classNode = ast.program.body.find((statement) => (
    statement.type === 'ExportNamedDeclaration'
  )).declaration;
  const result = readStyleScent(classNode);
  assert.deepEqual(result.violations, []);
  assert.equal(result.scent.motion.includes('two-beat-snap'), true);
});
