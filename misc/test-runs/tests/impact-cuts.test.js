import assert from 'node:assert/strict';
import test from 'node:test';

import * as applications from '@cut3/agent-memory/compositions/ImpactCuts';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { matchesPublicState, capturePublicState } from '@cut3/agent-memory/core/state';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Text } from '@cut3/agent-memory/units/base/Text';
import {
  CollageDepthOutlineImpact,
  PhotoChromaDepthImpact,
  PhotoDepthZoomImpact,
  PhotoPunch2dImpact,
  PhotoScreenBlendImpact,
  PhotoShadowPunchImpact,
  SolidCardDepthImpact,
  TriptychDepthImpact,
  TypeCollageDepthImpact,
  TypeDepthPanelImpact,
  TypeDepthRiseImpact,
  TypeDepthStackImpact,
  TypeDepthStampImpact,
  TypeDepthTiltImpact,
  requireImpactRole,
} from '@cut3/agent-memory/units/impact/ImpactRecipeUnits';

const CASES = Object.freeze([
  ['photo-depth-zoom', applications.impactPhotoDepthZoom, ['photo-a', 'ALPHA'], 36, 10, 3],
  ['photo-chroma-depth', applications.impactPhotoChromaDepth, ['photo-b', 'BRAVO'], 36, 10, 4],
  ['photo-punch-2d', applications.impactPhotoPunch2d, ['photo-c', 'CHARLIE'], 38, 8, 3],
  ['photo-screen-blend', applications.impactPhotoScreenBlend, ['photo-d', 'DELTA', 'ECHO'], 38, 10, 4],
  ['triptych-depth', applications.impactTriptychDepth, ['photo-e'], 38, 10, 5],
  ['photo-shadow-punch', applications.impactPhotoShadowPunch, ['photo-f'], 36, 7, 2],
  ['collage-depth-outline', applications.impactCollageDepthOutline, ['photo-g', 'FOXTROT'], 109, 12, 3],
  ['solid-card-depth', applications.impactSolidCardDepth, [], 38, 17, 2],
  ['type-depth-rise', applications.impactTypeDepthRise, ['GOLF'], 109, 25, 1],
  ['type-depth-panel', applications.impactTypeDepthPanel, ['HOTEL'], 36, 45, 2],
  ['type-depth-stack', applications.impactTypeDepthStack, ['INDIA'], 38, 32, 4],
  ['type-depth-stamp', applications.impactTypeDepthStamp, ['JULIET'], 36, 28, 2],
  ['type-depth-tilt', applications.impactTypeDepthTilt, ['KILO'], 38, 30, 1],
  ['type-collage-depth', applications.impactTypeCollageDepth, ['LIMA', 'MIKE'], 38, 35, 10],
]);

const BARE_CASES = Object.freeze([
  [PhotoDepthZoomImpact, 2, 1],
  [PhotoChromaDepthImpact, 1, 1],
  [PhotoPunch2dImpact, 1, 1],
  [PhotoScreenBlendImpact, 1, 2],
  [TriptychDepthImpact, 3, 0],
  [PhotoShadowPunchImpact, 1, 0],
  [CollageDepthOutlineImpact, 3, 1],
  [SolidCardDepthImpact, 0, 0],
  [TypeDepthRiseImpact, 0, 20],
  [TypeDepthPanelImpact, 0, 30],
  [TypeDepthStackImpact, 0, 20],
  [TypeDepthStampImpact, 0, 15],
  [TypeDepthTiltImpact, 0, 25],
  [TypeCollageDepthImpact, 0, 2],
]);

test('recipe Units own the authored static tree and hide no Behaviours', () => {
  for (const [Recipe, imageCount, captionCount] of BARE_CASES) {
    const images = Array.from({ length: imageCount }, () => new Image('runtime-photo'));
    const captions = Array.from({ length: captionCount }, () => new Text('RUNTIME COPY'));
    const unit = new Recipe(images, captions);
    assert.equal(countBehaviours(unit), 0);
    assert.ok(unit.cadenceBindings.length > 0);
    assert.ok(unit.cadenceBindings.every((binding) => belongsTo(binding.owner, unit)));
    assert.ok(unit.cadenceBindings.every((binding) => binding.owner.behaviours.length === 0));
  }
});

test('application outputs preserve exact cardinality and attach every cadence owner-first', () => {
  for (const [recipe, builder, args, _duration, units, behaviours] of CASES) {
    const root = builder(...args);
    assert.equal(root.recipe, recipe);
    assert.equal(countUnits(root), units);
    assert.equal(countBehaviours(root), behaviours);
    assert.ok(root.cadenceBindings.every(({ owner, role }) => (
      requireImpactRole(owner, recipe, role) === owner
    )));
    for (const unit of flatten(root)) {
      for (const behaviour of unit.behaviours) assert.equal(behaviour.unit, unit);
    }
  }
});

test('all 664 authored frame projections are finite, deterministic and transactional', () => {
  let frames = 0;
  for (const [_recipe, builder, args, duration] of CASES) {
    const root = builder(...args);
    const baseline = new Map(flatten(root).map((unit) => [unit, capturePublicState(unit)]));
    for (let frame = 0; frame < duration; frame += 1) {
      const input = { frame, fps: 60, duration, width: 1080, height: 1920 };
      const first = projectFrame(root, input);
      const second = projectFrame(root, input);
      for (const unit of flatten(root)) {
        assert.deepEqual(first.stateOf(unit), second.stateOf(unit));
        assertFinite(first.stateOf(unit));
        assert.ok(matchesPublicState(unit, baseline.get(unit)));
      }
      frames += 1;
    }
  }
  assert.equal(frames, 664);
});

test('representative authored laws retain exact windows and transform order', () => {
  const glitch = applications.impactTriptychDepth('runtime-photo');
  const ghosts = bindings(glitch, 'ghost');
  const image = bindings(glitch, 'image')[0];
  const at3 = projectFrame(glitch, context(3, 38));
  const at5 = projectFrame(glitch, context(5, 38));
  assert.equal(at3.stateOf(ghosts[0]).opacity, 0.5);
  assert.equal(at3.stateOf(ghosts[1]).opacity, 0.4);
  assert.equal(at3.stateOf(ghosts[0]).present, true);
  assert.equal(at5.stateOf(ghosts[0]).present, false);
  assert.equal(at5.stateOf(ghosts[0]).opacity, 0.5);
  assert.deepEqual(at3.stateOf(image).pose.operations.map((entry) => entry.kind), [
    'scale-2d',
    'rotate-y',
    'translate-x',
  ]);

  const ring = applications.impactSolidCardDepth();
  const ringOwner = bindings(ring, 'ring')[0];
  const at18 = projectFrame(ring, context(18, 38)).stateOf(ringOwner);
  assert.deepEqual(at18.pose.operations.map((entry) => entry.kind), ['rotate-x', 'rotate-y']);
  assert.equal(at18.pose.operations[1].degrees, 90);

  const collage = applications.impactTypeCollageDepth('PRIMARY', 'SECONDARY');
  const chroma = bindings(collage, 'chroma');
  const flash = bindings(collage, 'flash')[0];
  assert.ok(chroma.every((owner) => projectFrame(collage, context(4, 38)).stateOf(owner).present));
  assert.ok(chroma.every((owner) => !projectFrame(collage, context(5, 38)).stateOf(owner).present));
  assert.equal(projectFrame(collage, context(4, 38)).stateOf(flash).present, true);
  assert.equal(projectFrame(collage, context(5, 38)).stateOf(flash).present, false);
  const glitchBars = bindings(collage, 'glitch');
  assert.ok(glitchBars.every((owner) => projectFrame(collage, context(10, 38)).stateOf(owner).opacity === 1));
  assert.ok(glitchBars.every((owner) => projectFrame(collage, context(10, 38)).stateOf(owner).present));
  assert.ok(glitchBars.every((owner) => projectFrame(collage, context(13, 38)).stateOf(owner).opacity === 0));
  assert.ok(glitchBars.every((owner) => !projectFrame(collage, context(13, 38)).stateOf(owner).present));
});

test('typed raster prerequisites map without raw CSS bags', () => {
  const root = applications.impactPhotoPunch2d('runtime-photo', 'IMPACT');
  const tree = createReactDriver(ReactStub).render(root, context(17, 38));
  const filtered = find(tree, (node) => node.props?.style?.filter?.includes('drop-shadow'));
  assert.ok(filtered.length > 0);
  assert.match(filtered[0].props.style.filter, /drop-shadow\(0px 0px 20px rgba/u);

  const stamp = applications.impactTypeDepthStamp('STAMP');
  const stampTree = createReactDriver(ReactStub).render(stamp, context(17, 36));
  const bordered = find(stampTree, (node) => node.props?.style?.borderTop?.startsWith('2px'));
  assert.equal(bordered.length, 6);
  assert.ok(bordered.every((node) => node.props.style.boxSizing === 'border-box'));
});

test('public builders contain no guards, validation branches, style bags or private material', () => {
  for (const [_recipe, builder] of CASES) {
    const source = Function.prototype.toString.call(builder);
    assert.doesNotMatch(source, /\b(?:if|switch|throw|try|catch)\b/u);
    assert.doesNotMatch(source, /Array\.isArray|typeof|instanceof/u);
    assert.doesNotMatch(source, /\b(?:style|css)\s*:/u);
    assert.doesNotMatch(source, /https?:\/\/|W\d+C\d+|[a-f0-9]{32,}/iu);
    assert.doesNotMatch(source, /\.units|\.children|\.at\(|\[[0-9]+\]/u);
    assert.match(source, /new ImpactCutCadence/u);
    assert.match(source, /addBehaviour/u);
  }
});

const ReactStub = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

function context(frame, duration) {
  return { frame, fps: 60, duration, width: 1080, height: 1920 };
}

function bindings(root, role) {
  return root.cadenceBindings.filter((binding) => binding.role === role).map((binding) => binding.owner);
}

function flatten(unit) {
  return [unit, ...unit.units.flatMap(flatten)];
}

function countUnits(unit) {
  return flatten(unit).length;
}

function countBehaviours(unit) {
  return flatten(unit).reduce((sum, current) => sum + current.behaviours.length, 0);
}

function belongsTo(unit, root) {
  let current = unit;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function assertFinite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) assertFinite(nested);
}

function find(node, predicate, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of node.children ?? []) find(child, predicate, found);
  return found;
}
