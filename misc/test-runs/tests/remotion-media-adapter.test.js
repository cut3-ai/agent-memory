import assert from 'node:assert/strict';
import test from 'node:test';

import { Engine } from '@cut3/agent-memory/core/Engine';
import { projectFrame } from '@cut3/agent-memory/core/frame';
import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Shot } from '@cut3/agent-memory/units/base/Shot';
import { Video } from '@cut3/agent-memory/units/base/Video';
import { PremountedMediaShot } from '@cut3/agent-memory/units/media-montage/PremountedMediaShot';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

class LocalWindowVideo extends Video {
  static kind = 'unit.test.local-window-video';

  isVisible({ frame }) {
    return frame >= -2;
  }
}

test('Video backend, buffering and Shot premount state are typed and backward-compatible', () => {
  const defaults = new Video('runtime-default');
  assert.equal(defaults.backend, 'auto');
  assert.equal(defaults.pauseWhenBuffering, false);
  assert.equal(defaults.transparent, false);

  const typed = new Video('runtime-typed', {
    backend: 'video',
    pauseWhenBuffering: true,
  });
  assert.equal(typed.backend, 'video');
  assert.equal(typed.pauseWhenBuffering, true);

  const shot = new Shot(typed, {
    duration: 20,
    premountFor: 12,
    reconciliationKey: 'typed-shot-1',
  });
  assert.equal(shot.premountFor, 12);
  assert.equal(shot.reconciliationKey, 'typed-shot-1');
  const defaultShot = new Shot(new Video('runtime-shot-default'));
  assert.equal(defaultShot.premountFor, 0);
  assert.equal(defaultShot.reconciliationKey, null);

  assert.throws(() => new Video('runtime', { backend: 'unknown' }), /video\.backend/u);
  assert.throws(() => new Video('runtime', { transparent: 1 }), /must be a boolean/u);
  assert.throws(
    () => new Video('runtime', { backend: 'video', transparent: true }),
    /requires an offthread-video backend/u,
  );
  assert.throws(() => new Shot(new Video('runtime'), { premountFor: -1 }), /non-negative/u);
  assert.throws(() => new Shot(new Video('runtime'), { from: 0.5 }), /safe integer/u);
  assert.throws(() => new Shot(new Video('runtime'), { duration: 1.5 }), /safe integer/u);
  assert.throws(() => new Shot(new Video('runtime'), { premountFor: 0.5 }), /safe integer/u);
  assert.throws(
    () => new Shot(new Video('runtime'), { from: Number.MAX_SAFE_INTEGER, duration: 1 }),
    /safe integer frames/u,
  );
  for (const reconciliationKey of ['', 'bad key', 'a'.repeat(129), 1, {}]) {
    assert.throws(
      () => new Shot(new Video('runtime'), { reconciliationKey }),
      /stable identifier/u,
    );
  }
  assert.throws(() => {
    shot.reconciliationKey = 'changed-shot';
  }, /read only/iu);
  assert.throws(
    () => new PremountedMediaShot(new Video('runtime'), { pauseWhenBuffering: 'yes' }),
    /must be a boolean/u,
  );
});

test('Shot lifecycle projects only its bounded premount window with local child time', () => {
  const first = new Shot(new Video('runtime-active'), {
    duration: 20,
    from: 0,
    premountFor: 5,
    reconciliationKey: 'epoch-1',
  });
  const futureVideo = new LocalWindowVideo('runtime-future');
  const future = new Shot(futureVideo, {
    duration: 10,
    from: 20,
    premountFor: 5,
    reconciliationKey: 'epoch-2',
  });
  const root = new Layer(first);
  root.addUnit(future);

  const before = projectFrame(root, inputAt(14, 40));
  assert.equal(before.has(first), true);
  assert.equal(before.has(future), false);

  const premountStart = projectFrame(root, inputAt(15, 40));
  assert.equal(premountStart.has(future), true);
  assert.equal(future.mountPhase(premountStart.contextOf(future)), 'premount');
  assert.equal(premountStart.has(futureVideo), false);

  const locallyVisible = projectFrame(root, inputAt(18, 40));
  assert.equal(locallyVisible.has(futureVideo), true);
  assert.equal(locallyVisible.contextOf(futureVideo).frame, -2);

  const remotionBefore = createRemotionDriver(React, remotion()).render(root, inputAt(14, 40));
  assert.deepEqual(
    findAll(remotionBefore, (node) => node.type === 'remotion-sequence')
      .map((node) => node.props.key),
    ['epoch-1'],
  );
  const remotionPremount = createRemotionDriver(React, remotion())
    .render(root, inputAt(18, 40));
  const premountedSequences = findAll(
    remotionPremount,
    (node) => node.type === 'remotion-sequence',
  );
  assert.deepEqual(premountedSequences.map((node) => node.props.key), ['epoch-1', 'epoch-2']);
  assert.equal(premountedSequences[1].props.premountFor, 5);
  assert.equal(findAll(remotionPremount, (node) => node.type === 'remotion-offthread-video').length, 2);

  const engine = new Engine(root).at(inputAt(18, 40));
  assert.equal(engine.children.length, 2);
  assert.deepEqual(engine.children.map((child) => child.reconciliationKey), [
    'epoch-1',
    'epoch-2',
  ]);
  const plain = createReactDriver(React).render(root, inputAt(18, 40));
  assert.deepEqual(
    findAll(plain, (node) => node.type === 'video').map((node) => node.props.src),
    ['runtime-active'],
  );

  const active = createRemotionDriver(React, remotion()).render(root, inputAt(20, 40));
  assert.deepEqual(
    findAll(active, (node) => node.type === 'remotion-sequence').map((node) => node.props.key),
    ['epoch-2'],
  );
  assert.equal(projectFrame(root, inputAt(30, 40)).has(future), false);
  assert.equal(createRemotionDriver(React, remotion()).render(root, inputAt(30, 40)).children.length, 0);
});

test('React reconciliation fails closed for duplicate sibling Shot epochs', () => {
  const first = new Shot(new Video('runtime-duplicate-1'), {
    duration: 10,
    reconciliationKey: 'duplicate-epoch',
  });
  const second = new Shot(new Video('runtime-duplicate-2'), {
    duration: 10,
    reconciliationKey: 'duplicate-epoch',
  });
  const root = new Layer(first);
  root.addUnit(second);

  assert.throws(
    () => createRemotionDriver(React, remotion()).render(root, inputAt(0, 10)),
    /distinct reconciliation keys/u,
  );
});

test('React video selector receives resolved typed state and fails closed', () => {
  const seen = [];
  const driver = createReactDriver(React, {
    selectVideoComponent({ state }) {
      seen.push(state);
      return state.backend === 'video' ? 'selected-video' : 'selected-offthread';
    },
  });
  const tree = driver.render(new Video('runtime-selected', {
    backend: 'video',
    pauseWhenBuffering: true,
  }), input());
  assert.equal(tree.type, 'selected-video');
  assert.equal(tree.props.pauseWhenBuffering, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].backend, 'video');
  assert.equal(seen[0].pauseWhenBuffering, true);

  assert.throws(
    () => createReactDriver(React, { selectVideoComponent: 'invalid' }),
    /must be a function/u,
  );
  assert.throws(
    () => createReactDriver(React, { selectVideoComponent: () => null })
      .render(new Video('runtime'), input()),
    /must return a video component/u,
  );

  const native = createReactDriver(React).render(new Video('runtime-native'), input());
  assert.equal(native.type, 'video');
  assert.equal(Object.hasOwn(native.props, 'pauseWhenBuffering'), false);

  assert.throws(
    () => createReactDriver(React).render(new Video('runtime-transparent', {
      backend: 'offthread-video',
      transparent: true,
    }), input()),
    /explicitly selected video component/u,
  );
  const selectedTransparent = createReactDriver(React, {
    selectVideoComponent: () => 'selected-offthread',
  }).render(new Video('runtime-transparent', {
    backend: 'offthread-video',
    transparent: true,
  }), input());
  assert.equal(selectedTransparent.props.transparent, true);
});

test('Remotion selects ordinary and offthread backends per Video and maps buffering/premount', () => {
  const ordinary = new Shot(new Video('runtime-ordinary', {
    backend: 'video',
    pauseWhenBuffering: true,
  }), { duration: 20, premountFor: 12, name: 'ordinary-shot' });
  const offthread = new Shot(new Video('runtime-offthread', {
    backend: 'offthread-video',
    transparent: true,
  }), { duration: 20, premountFor: 7, name: 'offthread-shot' });
  const root = new Layer(ordinary);
  root.addUnit(offthread);
  const tree = createRemotionDriver(React, remotion()).render(root, input(20));
  const sequences = findAll(tree, (node) => node.type === 'remotion-sequence');
  const ordinaryNode = findAll(tree, (node) => node.type === 'remotion-video')[0];
  const offthreadNode = findAll(tree, (node) => node.type === 'remotion-offthread-video')[0];

  assert.deepEqual(sequences.map((node) => node.props.premountFor), [12, 7]);
  assert.equal(ordinaryNode.props.pauseWhenBuffering, true);
  assert.equal(offthreadNode.props.pauseWhenBuffering, false);
  assert.equal(offthreadNode.props.transparent, true);
  assert.equal(ordinaryNode.props.src, 'runtime-ordinary');
  assert.equal(offthreadNode.props.src, 'runtime-offthread');
});

test('legacy semantic Shot handoff resolves backend and buffering without family changes', () => {
  const video = new Video('runtime-legacy');
  const shot = new PremountedMediaShot(new Layer(video), {
    duration: 20,
    mediaBackend: 'video',
    pauseWhenBuffering: true,
    premountFor: 60,
  });
  const tree = createRemotionDriver(React, remotion()).render(shot, input(20));
  const sequence = findAll(tree, (node) => node.type === 'remotion-sequence')[0];
  const rendered = findAll(tree, (node) => node.type === 'remotion-video')[0];

  assert.equal(sequence.props.premountFor, 60);
  assert.equal(Object.hasOwn(sequence.props, 'key'), false);
  assert.equal(rendered.props.pauseWhenBuffering, true);
  assert.equal(rendered.props.src, 'runtime-legacy');
  assert.equal(findAll(tree, (node) => node.type === 'remotion-offthread-video').length, 0);
});

test('Remotion backend selection is fail-closed while auto preserves historical fallback', () => {
  assert.throws(
    () => createRemotionDriver(React, {
      OffthreadVideo: 'remotion-offthread-video',
      Sequence: 'remotion-sequence',
    }).render(new Video('runtime', { backend: 'video' }), input()),
    /requires Remotion\.Video/u,
  );
  assert.throws(
    () => createRemotionDriver(React, {
      Sequence: 'remotion-sequence',
      Video: 'remotion-video',
    }).render(new Video('runtime', { backend: 'offthread-video' }), input()),
    /requires Remotion\.OffthreadVideo/u,
  );
  assert.throws(
    () => createRemotionDriver(React, {
      Sequence: 'remotion-sequence',
      Video: 'remotion-video',
    }).render(new Video('runtime-transparent', { transparent: true }), input()),
    /transparent video requires Remotion\.OffthreadVideo/u,
  );

  const ordinaryFallback = createRemotionDriver(React, {
    Sequence: 'remotion-sequence',
    Video: 'remotion-video',
  }).render(new Video('runtime-auto'), input());
  assert.equal(ordinaryFallback.type, 'remotion-video');

  const preferredOffthread = createRemotionDriver(React, remotion())
    .render(new Video('runtime-auto'), input());
  assert.equal(preferredOffthread.type, 'remotion-offthread-video');
});

function remotion() {
  return {
    OffthreadVideo: 'remotion-offthread-video',
    Sequence: 'remotion-sequence',
    Video: 'remotion-video',
  };
}

function input(duration = 30) {
  return { duration, fps: 60, frame: 0, height: 1920, width: 1080 };
}

function inputAt(frame, duration = 30) {
  return { duration, fps: 60, frame, height: 1920, width: 1080 };
}

function findAll(node, predicate, output = []) {
  if (!node || typeof node !== 'object') return output;
  if (predicate(node)) output.push(node);
  (node.children ?? []).forEach((child) => findAll(child, predicate, output));
  return output;
}
