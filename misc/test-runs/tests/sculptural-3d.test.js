import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { HeartPulseOrbit } from '@cut3/agent-memory/behaviours/sculptural-3d/HeartPulseOrbit';
import { InkTendrilReveal } from '@cut3/agent-memory/behaviours/sculptural-3d/InkTendrilReveal';
import { ScissorSnapFlight } from '@cut3/agent-memory/behaviours/sculptural-3d/ScissorSnapFlight';
import { ScissorsStageCadence } from '@cut3/agent-memory/behaviours/sculptural-3d/ScissorsStageCadence';
import {
  fastPulseHeartHero,
  impactScissorsHero,
  impactScissorsStage,
  inkTendrilPlane,
  minimalScissorsHero,
  minimalScissorsStage,
  slowPulseHeartHero,
} from '@cut3/agent-memory/compositions/Sculptural3DHeroes';
import { Unit } from '@cut3/agent-memory/core/Unit';
import { visitUnits } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { publicSnapshot } from '@cut3/agent-memory/core/state';
import {
  easeOutCubic,
  interpolateRange,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { InkTendrilPlane } from '@cut3/agent-memory/units/sculptural-3d/InkTendrilPlane';
import { SculpturalHeartHero } from '@cut3/agent-memory/units/sculptural-3d/SculpturalHeartHero';
import { SculpturalScissorsHero } from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsHero';
import { SculpturalScissorsStage } from '@cut3/agent-memory/units/sculptural-3d/SculpturalScissorsStage';

const FPS = 60;
const RECIPES = Object.freeze([
  Object.freeze([slowPulseHeartHero, 420]),
  Object.freeze([fastPulseHeartHero, 270]),
  Object.freeze([impactScissorsHero, 180]),
  Object.freeze([minimalScissorsHero, 300]),
  Object.freeze([inkTendrilPlane, 67]),
]);
const FAMILY_SOURCE_URLS = Object.freeze([
  '../../../src/compositions/Sculptural3DHeroes.js',
  '../../../src/units/sculptural-3d/InkTendrilPlane.js',
  '../../../src/units/sculptural-3d/SculpturalHeartHero.js',
  '../../../src/units/sculptural-3d/SculpturalScissorsHero.js',
  '../../../src/units/sculptural-3d/SculpturalScissorsStage.js',
  '../../../src/units/sculptural-3d/sculpturalSemantics.js',
  '../../../src/behaviours/sculptural-3d/HeartPulseOrbit.js',
  '../../../src/behaviours/sculptural-3d/InkTendrilReveal.js',
  '../../../src/behaviours/sculptural-3d/ScissorSnapFlight.js',
  '../../../src/behaviours/sculptural-3d/ScissorsStageCadence.js',
]);
const SYNTHETIC_COPY = Object.freeze(['AAA', 'B', 'CCC', 'D'.repeat(15)]);

test('bare sculptural Units are compact semantic host contracts with zero hidden Behaviours', () => {
  const heart = new SculpturalHeartHero('slow-pulse');
  assert.equal(heart.units.length, 0);
  assert.deepEqual(heart.capability, {
    contract: 'heart-hero/v1',
    kind: 'native-sculptural-scene',
  });
  assert.deepEqual(heart.scene, {
    aura: 'concentric-crimson-glow',
    form: 'centered-extruded-heart',
    framing: 'portrait-center',
    lighting: 'pulse-linked-crimson',
    particles: { count: 80, treatment: 'orbiting-embers' },
  });
  assert.deepEqual(heart.motion, {
    aura: { innerOpacity: 0.11, outerOpacity: 0.04 },
    particles: { orbitFrame: 0 },
    pulseLight: { intensity: 3 },
    sculpture: {
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    },
  });
  assert.deepEqual(heart.animationTargets(), [{ owner: heart, role: 'heart-scene' }]);

  const impact = new SculpturalScissorsHero('impact');
  assert.equal(impact.height, 1440);
  assert.deepEqual(impact.frame, { x: 0, y: 0, width: 1080, height: 1440 });
  assert.equal(impact.units.length, 0);
  assert.deepEqual(impact.scene, {
    form: 'open-scissors',
    framing: 'upper-stage-impact',
    lighting: 'cold-metal-punch',
    treatment: 'polished-cobalt',
  });
  assert.deepEqual(impact.motion.blades.map(({ rotation, scale }) => ({ rotation, scale })), [
    { rotation: [0, 0, 0.67], scale: [1, 1, 1] },
    { rotation: [0, 0, -0.67], scale: [1, -1, 1] },
  ]);
  assert.deepEqual(impact.motionTargets(), [{ owner: impact, role: 'impact-scene' }]);

  const minimal = new SculpturalScissorsHero('minimal');
  assert.equal(minimal.height, 1920);
  assert.equal(minimal.units.length, 0);
  assert.deepEqual(minimal.motion.entrance, {
    position: [0, 1.1, 0], rotation: [0, 0, 0], scale: [0, 0, 0],
  });
  assert.deepEqual(minimal.motion.blades.map(({ position }) => position), [
    [0, 0, 0.04], [0, 0, -0.04],
  ]);
  assert.deepEqual(minimal.animationTargets(), [{ owner: minimal, role: 'minimal-scene' }]);

  const ink = new InkTendrilPlane();
  assert.equal(ink.units.length, 0);
  assert.deepEqual(ink.capability, {
    contract: 'ink-tendril-plane/v1',
    kind: 'native-sculptural-scene',
  });
  assert.deepEqual(ink.reveal, { aspect: 1080 / 1920, progress: 0, time: 0 });
  assert.equal(ink.plane, ink);
  assert.deepEqual(ink.animationTargets(), [{ owner: ink, role: 'ink-plane' }]);

  for (const unit of [heart, impact, minimal, ink]) {
    visitUnits(unit, (child) => {
      assert.deepEqual(child.behaviours, []);
      assert.equal(Object.hasOwn(child, 'style'), false);
      assert.equal(Object.hasOwn(child, 'css'), false);
      assertNoNativeGraph(publicSnapshot(child));
    });
  }
});

test('guard-free builders attach explicit owner-first family laws in target order', () => {
  for (const builder of [
    ...RECIPES.map(([make]) => make),
    impactScissorsStage,
    minimalScissorsStage,
  ]) assertGuardFree(builder);

  for (const unit of [slowPulseHeartHero(), fastPulseHeartHero()]) {
    assert.equal(unit.animationTargets()[0].owner, unit);
    for (const { owner } of unit.animationTargets()) {
      assertKinds(owner, ['behaviour.sculptural-3d.heart-pulse-orbit']);
    }
  }
  for (const unit of [impactScissorsHero(), minimalScissorsHero()]) {
    for (const { owner } of unit.animationTargets()) {
      assertKinds(owner, ['behaviour.sculptural-3d.scissor-snap-flight']);
    }
  }
  const ink = inkTendrilPlane();
  assertKinds(ink.plane, [
    'behaviour.sculptural-3d.ink-tendril-reveal',
  ]);

  for (const stage of [
    impactScissorsStage(...SYNTHETIC_COPY),
    minimalScissorsStage(...SYNTHETIC_COPY),
  ]) {
    stage.scene.motionTargets().forEach(({ owner }) => {
      assertKinds(owner, ['behaviour.sculptural-3d.scissor-snap-flight']);
    });
    stage.animationTargets().forEach(({ owner }) => {
      assertKinds(owner, ['behaviour.sculptural-3d.scissors-stage-cadence']);
    });
  }
});

test('closed semantic target registries reject generic or cross-family Units', () => {
  assert.throws(() => new HeartPulseOrbit(new Unit()), TypeError);
  assert.throws(() => new ScissorSnapFlight(new Unit()), TypeError);
  assert.throws(() => new ScissorsStageCadence(new Unit()), TypeError);
  assert.throws(() => new InkTendrilReveal(new Unit()), TypeError);

  const heartTarget = slowPulseHeartHero().animationTargets()[0].owner;
  const scissorTarget = impactScissorsHero().animationTargets()[0].owner;
  assert.throws(() => new ScissorSnapFlight(heartTarget), TypeError);
  assert.throws(() => new HeartPulseOrbit(scissorTarget), TypeError);
  assert.throws(() => new SculpturalHeartHero('unknown'), TypeError);
  assert.throws(() => new SculpturalScissorsHero('unknown'), TypeError);
});

test('bare full-occurrence stages own exact authored DOM topology and runtime Text roles', () => {
  const impact = new SculpturalScissorsStage(syntheticTextUnits(), 'impact');
  const minimal = new SculpturalScissorsStage(syntheticTextUnits(), 'minimal');
  const impactNodes = collect(impact);
  const minimalNodes = collect(minimal);

  assert.equal(impact.units.length, 8);
  assert.equal(impactNodes.length, 659);
  assert.equal(minimal.units.length, 2);
  assert.equal(minimalNodes.length, 12);
  assert.deepEqual(Object.values(impact.copy).map((unit) => unit.text), SYNTHETIC_COPY);
  assert.deepEqual(Object.values(minimal.copy).map((unit) => unit.text), SYNTHETIC_COPY);

  const sceneMount = named(impact, 'sculptural-impact-scene-mount');
  assert.equal(impact.scene.parent, sceneMount);
  assert.equal(sceneMount.frame.y, '-30%');
  assert.equal(sceneMount.frame.height, '75%');
  assert.equal(impact.scene.height, 1440);
  assert.equal(named(impact, 'sculptural-impact-scanline-veil').units.length, 640);
  assert.deepEqual(
    named(impact, 'sculptural-impact-scanline-tile-0').paint.backgrounds[0].stops,
    [
      { offset: 0, color: 'rgba(0,0,0,0.025)' },
      { offset: 1 / 3, color: 'transparent' },
      { offset: 1, color: 'transparent' },
    ],
  );
  assert.deepEqual(
    impact.paint.backgrounds[0].stops.map(({ offset, color }) => [offset, color]),
    [[0, '#0e1628'], [0.45, '#080c17'], [1, '#030508']],
  );
  assert.equal(named(impact, 'sculptural-impact-copy-overlay').layout.padding.bottom, 320);
  assert.equal(named(minimal, 'sculptural-minimal-copy-overlay').layout.padding.bottom, 260);

  assert.deepEqual([
    impact.copy.lead.typography.family,
    impact.copy.subtitle.typography.family,
    minimal.copy.lead.typography.family,
    minimal.copy.subtitle.typography.family,
  ], [
    'Bebas Neue, system-ui',
    'Montserrat, system-ui',
    'Bebas Neue, sans-serif',
    'Barlow Condensed, sans-serif',
  ]);
  assert.deepEqual([
    impact.copy.lead.typography.size,
    impact.copy.mark.typography.size,
    impact.copy.trail.typography.size,
    impact.copy.subtitle.typography.size,
  ], [148, 200, 148, 28]);
  assert.deepEqual([
    minimal.copy.lead.typography.size,
    minimal.copy.mark.typography.size,
    minimal.copy.trail.typography.size,
    minimal.copy.subtitle.typography.size,
  ], [128, 160, 128, 34]);

  for (const unit of [...impactNodes, ...minimalNodes]) {
    assert.deepEqual(unit.behaviours, []);
    assert.equal(Object.hasOwn(unit, 'style'), false);
    assert.equal(Object.hasOwn(unit, 'css'), false);
  }
});

test('full impact DOM cadence reproduces every authored glow, flash and copy frame', () => {
  const duration = 180;
  const unit = impactScissorsStage(...SYNTHETIC_COPY);
  const targets = targetsByRole(unit);
  const authored = snapshotsOf([...targets.values()]);
  for (let frame = 0; frame < duration; frame += 1) {
    const projection = projectFrame(unit, context(frame, duration));
    const globalOpacity = interpolateRange(frame, [0, 4], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const exit = progress(frame, 150, 30) ** 3;
    const exitOpacity = 1 - exit;
    const shimmer = interpolateRange(Math.sin(frame * 0.07), [-1, 1], [0.85, 1.15]);

    close(projection.stateOf(targets.get('impact-large-glow')).opacity,
      globalOpacity * exitOpacity * shimmer);
    const core = projection.stateOf(targets.get('impact-core-glow'));
    close(core.opacity, globalOpacity * exitOpacity);
    assert.deepEqual(core.pose.operations, [{
      kind: 'translate-2d',
      x: '-50%',
      y: `calc(-50% + ${Math.sin(frame * 0.025) * 6}px)`,
    }]);
    const atmosphere = projection.stateOf(targets.get('impact-atmosphere'));
    close(atmosphere.opacity, globalOpacity * exitOpacity * 0.6);
    close(atmosphere.paint.backgrounds[0].angle, frame * 0.5);
    const flashStart = 54;
    const flash = interpolateRange(
      frame,
      [flashStart, flashStart + 4, flashStart + 10],
      [0, 0.55, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    assert.equal(
      projection.stateOf(targets.get('impact-snap-flash')).paint.backgrounds[0].stops[0].color,
      `rgba(93,145,255,${flash})`,
    );
    const entrance = springValue({
      frame: frame - 5,
      fps: FPS,
      config: { damping: 20, stiffness: 85, mass: 0.8 },
    });
    const group = projection.stateOf(targets.get('impact-copy-group'));
    close(group.opacity, globalOpacity * exitOpacity);
    close(group.pose.operations[0].x, entrance * exitOpacity);
    close(group.pose.operations[0].y, entrance * exitOpacity);
    close(group.pose.operations[1].value, Math.sin(frame * 0.033) * 3);
    close(projection.stateOf(targets.get('impact-mark')).effects.brightness, shimmer);
    const rule = projection.stateOf(targets.get('impact-rule'));
    close(rule.effects.blur, 0.5);
    close(rule.effects.brightness, shimmer);
    assertTargetRollback(targets, authored);
    [...targets.values()].forEach((owner) => assertFinite(projection.stateOf(owner)));
  }
});

test('full minimal DOM cadence reproduces every authored fade, entrance and blue pulse frame', () => {
  const duration = 300;
  const unit = minimalScissorsStage(...SYNTHETIC_COPY);
  const targets = targetsByRole(unit);
  const authored = snapshotsOf([...targets.values()]);
  for (let frame = 0; frame < duration; frame += 1) {
    const projection = projectFrame(unit, context(frame, duration));
    const opacity = interpolateRange(frame, [0, 30, 270, 300], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    close(projection.stateOf(targets.get('minimal-stage')).opacity, opacity);
    const entrance = springValue({
      frame,
      fps: FPS,
      config: { damping: 22, stiffness: 55, mass: 1 },
    });
    const group = projection.stateOf(targets.get('minimal-copy-group'));
    close(group.pose.operations[0].value, interpolateRange(entrance, [0, 1], [60, 0]));
    const scale = interpolateRange(entrance, [0, 1], [0.75, 1]);
    close(group.pose.operations[1].x, scale);
    close(group.pose.operations[1].y, scale);
    const signal = Math.sin(frame * 0.07);
    const glow = interpolateRange(signal, [-1, 1], [18, 38]);
    const mark = projection.stateOf(targets.get('minimal-mark'));
    close(mark.opacity, interpolateRange(signal, [-1, 1], [0.6, 1]));
    assert.deepEqual(mark.typography.shadows.map(({ blur, color }) => [blur, color]), [
      [glow, '#5D91FF'],
      [glow * 1.8, '#5D91FF88'],
      [glow * 3, '#5D91FF44'],
    ]);
    assertTargetRollback(targets, authored);
    [...targets.values()].forEach((owner) => assertFinite(projection.stateOf(owner)));
  }
});

test('family source is privacy-safe and application output has no positional child lookup or styles', () => {
  const [applicationSource, ...semanticSources] = FAMILY_SOURCE_URLS.map((relative) => (
    readFileSync(new URL(relative, import.meta.url), 'utf8')
  ));
  assert.doesNotMatch(applicationSource, /(?:animationTargets\(\)|units|children)\s*\[/u);
  assert.doesNotMatch(applicationSource, /\b(?:style|css|frame|paint|pose|effects|typography)\s*:/u);
  for (const source of [applicationSource, ...semanticSources]) {
    assert.doesNotMatch(source, /https?:\/\//iu);
    assert.doesNotMatch(source, /\bworkspace[-_ ]?\d+\b/iu);
    assert.doesNotMatch(source, /\b(?:source|prompt|url|hash)\s*:/iu);
    assert.doesNotMatch(source, /(?:vertex|fragment)Shader\s*:/u);
    assert.doesNotMatch(source, /units\/base\/Scene3D|\bScene3D(?:Camera|Environment|Group|Light|Mesh|Points)?\b/u);
    assert.doesNotMatch(source, /scene3D(?:Geometry|Material)|heartParticleGeometry/u);
  }
});

test('both heart variants reproduce every pulse, aura, light and particle frame exactly', () => {
  for (const [make, duration, bpm] of [
    [slowPulseHeartHero, 420, 117.5],
    [fastPulseHeartHero, 270, 161.5],
  ]) {
    const unit = make();
    const [{ owner }] = unit.animationTargets();
    const authored = structuredClone(publicSnapshot(owner));
    for (let frame = 0; frame < duration; frame += 1) {
      const projection = projectFrame(unit, context(frame, duration));
      const beat = springValue({
        frame: frame % ((FPS * 60) / bpm),
        fps: FPS,
        config: { damping: 7, stiffness: 210, mass: 0.22 },
      });
      const punch = 1 - beat;
      const scale = 1.1 + (0.28 * punch);
      const state = projection.stateOf(owner);
      const sculpture = state.motion.sculpture;
      close(sculpture.position[1], Math.sin(frame * 0.034) * 15);
      close(sculpture.rotation[1], frame * 0.0065);
      sculpture.scale.forEach((value) => close(value, scale));
      close(state.motion.aura.innerOpacity, 0.11 + (0.3 * punch));
      close(state.motion.aura.outerOpacity, 0.04 + (0.22 * punch));
      close(state.motion.pulseLight.intensity, 3 + (5 * punch));
      assert.equal(state.motion.particles.orbitFrame, frame);
      assertFinite(state);
      assert.deepEqual(publicSnapshot(owner), authored);
    }
  }
});

test('impact scissors reproduce every flight, snap, float and cubic collapse frame', () => {
  const duration = 180;
  const unit = impactScissorsHero();
  const [{ owner }] = unit.animationTargets();
  const authored = structuredClone(publicSnapshot(owner));
  for (let frame = 0; frame < duration; frame += 1) {
    const projection = projectFrame(unit, context(frame, duration));
    const flight = springValue({
      frame,
      fps: FPS,
      config: { damping: 18, stiffness: 90, mass: 0.9 },
    });
    const exit = progress(frame, 150, 30) ** 3;
    const scale = flight * (1 - exit);
    const state = projection.stateOf(owner);
    const root = state.motion.sculpture;
    close(root.position[0], 8 - (8 * flight));
    close(root.position[1], Math.sin(frame * 0.025) * 0.12);
    close(root.rotation[0], Math.sin(frame * 0.018) * 0.04);
    root.scale.forEach((value) => close(value, scale));
    const snap = interpolateRange(frame - 39, [0, 10.5, 21], [1, 0.02, 0.08], {
      easing: easeOutCubic,
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    close(state.motion.blades[0].rotation[2], 0.22 + (snap * 0.45));
    close(state.motion.blades[1].rotation[2], -0.22 - (snap * 0.45));
    assert.deepEqual(state.motion.blades[1].scale, [1, -1, 1]);
    assert.deepEqual(publicSnapshot(owner), authored);
  }
});

test('minimal scissors reproduce every fade, delayed entrance, float and opening frame', () => {
  const duration = 300;
  const unit = minimalScissorsHero();
  const [{ owner }] = unit.animationTargets();
  const authored = structuredClone(publicSnapshot(owner));
  for (let frame = 0; frame < duration; frame += 1) {
    const projection = projectFrame(unit, context(frame, duration));
    const opacity = interpolateRange(frame, [0, 30, 270, 300], [0, 1, 1, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const state = projection.stateOf(owner);
    close(state.opacity, opacity);
    const entrance = springValue({
      frame: frame - 10,
      fps: FPS,
      config: { damping: 18, stiffness: 50, mass: 1.4 },
    });
    state.motion.entrance.scale.forEach((value) => close(value, entrance));
    const sculpture = state.motion.sculpture;
    close(sculpture.position[1], Math.sin(frame * 0.035) * 0.06);
    close(sculpture.rotation[1], Math.sin(frame * 0.018) * 0.18);
    const open = springValue({
      frame,
      fps: FPS,
      config: { damping: 20, stiffness: 60, mass: 1.2 },
    }) * 0.32;
    close(state.motion.blades[0].rotation[2], -open);
    close(state.motion.blades[1].rotation[2], open);
    assert.deepEqual(state.motion.blades.map(({ position }) => position), [
      [0, 0, 0.04], [0, 0, -0.04],
    ]);
    assert.deepEqual(publicSnapshot(owner), authored);
  }
});

test('ink semantic contract reproduces every sine-in-out progress and time frame', () => {
  const duration = 67;
  const unit = inkTendrilPlane();
  const plane = unit.plane;
  const authored = structuredClone(publicSnapshot(plane));
  for (let frame = 0; frame < duration; frame += 1) {
    const state = projectFrame(unit, context(frame, duration)).stateOf(plane);
    const linear = frame / (duration - 1);
    close(state.reveal.progress, (1 - Math.cos(Math.PI * linear)) / 2);
    close(state.reveal.time, frame * 0.1);
    close(state.reveal.aspect, 1080 / 1920);
    assertNoNativeGraph(state);
    assert.deepEqual(publicSnapshot(plane), authored);
  }
});

test('native host renderers replace all semantic roots without the generic Scene3D driver', () => {
  const React = {
    Fragment: 'fragment',
    createElement(type, props, ...children) {
      return { children, props: props ?? {}, type };
    },
  };
  const captured = [];
  const renderNative = (input) => {
    captured.push(input);
    return input.React.createElement('native-sculptural-scene', {
      capability: input.state.capability.contract,
      frame: input.context.frame,
      scene: input.state.scene,
      state: input.state.motion ?? input.state.reveal,
      unitKind: input.unit.constructor.kind,
    });
  };
  const driver = createReactDriver(React, {
    unitRenderers: {
      [SculpturalHeartHero.kind]: renderNative,
      [SculpturalScissorsHero.kind]: renderNative,
      [InkTendrilPlane.kind]: renderNative,
    },
  });

  for (const [make, duration] of RECIPES) {
    const frame = Math.floor(duration * 0.43);
    const output = driver.render(make(), context(frame, duration));
    assert.equal(output.type, 'native-sculptural-scene');
    assert.equal(output.props.frame, frame);
    assert.match(output.props.capability, /\/v1$/u);
  }

  assert.equal(captured.length, 5);
  captured.forEach((input) => {
    assert.equal(input.projectedChildren.length, 0);
    assert.equal(typeof input.renderChildren, 'function');
    assertNoNativeGraph(input.state);
  });
});

test('all five recipes are deterministic, projection-safe and finite through real Composition wrappers', () => {
  let projectedFrames = 0;
  for (const [make, duration] of RECIPES) {
    const unit = make();
    const nodes = [];
    visitUnits(unit, (child) => nodes.push(child));
    const authored = new Map(nodes.map((child) => [
      child,
      structuredClone(publicSnapshot(child)),
    ]));
    const sampleFrame = Math.floor(duration * 0.61);
    const first = projectFrame(unit, context(sampleFrame, duration));
    const second = projectFrame(unit, context(sampleFrame, duration));
    nodes.forEach((child) => {
      assert.deepEqual(first.stateOf(child), second.stateOf(child));
      assert.deepEqual(publicSnapshot(child), authored.get(child));
    });

    const composition = new Composition(unit, {
      background: '#000000', duration, fps: FPS, height: 1920, width: 1080,
    });
    const tree = [];
    visitUnits(composition, (child) => tree.push(child));
    const compositionAuthored = new Map(tree.map((child) => [
      child,
      structuredClone(publicSnapshot(child)),
    ]));
    for (let frame = 0; frame < duration; frame += 1) {
      const frameContext = context(frame, duration);
      const projection = projectFrame(composition, frameContext);
      const repeated = projectFrame(composition, frameContext);
      tree.forEach((child) => {
        assertFinite(projection.stateOf(child));
        assert.deepEqual(projection.stateOf(child), repeated.stateOf(child));
        assert.deepEqual(publicSnapshot(child), compositionAuthored.get(child));
      });
      projectedFrames += 1;
    }
  }
  assert.equal(projectedFrames, 1237);
});

function assertKinds(owner, expected) {
  assert.deepEqual(owner.behaviours.map((behaviour) => behaviour.constructor.kind), expected);
  assert.ok(owner.behaviours.every((behaviour) => behaviour.unit === owner));
}

function syntheticTextUnits() {
  return {
    lead: new Text(SYNTHETIC_COPY[0]),
    mark: new Text(SYNTHETIC_COPY[1]),
    trail: new Text(SYNTHETIC_COPY[2]),
    subtitle: new Text(SYNTHETIC_COPY[3]),
  };
}

function collect(root) {
  const nodes = [];
  visitUnits(root, (unit) => nodes.push(unit));
  return nodes;
}

function named(root, name) {
  const unit = collect(root).find((candidate) => candidate.name === name);
  assert.ok(unit, `${name} is missing`);
  return unit;
}

function targetsByRole(unit) {
  return new Map(unit.animationTargets().map(({ owner, role }) => [role, owner]));
}

function snapshotsOf(units) {
  return new Map(units.map((unit) => [unit, structuredClone(publicSnapshot(unit))]));
}

function assertTargetRollback(targets, authored) {
  targets.forEach((owner) => assert.deepEqual(publicSnapshot(owner), authored.get(owner)));
}

function assertGuardFree(builder) {
  const forbidden = /\b(?:if|else|switch|case|throw|try|catch|finally|typeof|instanceof|for|while|do)\b|\?|&&|\|\||\?\?/u;
  assert.doesNotMatch(builder.toString(), forbidden);
}

function assertNoNativeGraph(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertNoNativeGraph);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /^(?:environment|fragmentShader|geometry|material|program|renderer|shader|shaderSource|uniforms|vertexShader)$/u,
    );
    assertNoNativeGraph(child);
  }
}

function assertFinite(value) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertFinite);
    return;
  }
  Object.values(value).forEach(assertFinite);
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} !== ${expected}`);
}

function context(frame, duration) {
  return { duration, fps: FPS, frame, height: 1920, width: 1080 };
}
