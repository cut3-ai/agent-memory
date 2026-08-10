import assert from 'node:assert/strict';
import test from 'node:test';

import { createReactDriver } from '@cut3/agent-memory/drivers/react';
import { createRemotionDriver } from '@cut3/agent-memory/drivers/remotion';
import { Audio } from '@cut3/agent-memory/units/base/Audio';
import { Composition } from '@cut3/agent-memory/units/base/Composition';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';
import { Video } from '@cut3/agent-memory/units/base/Video';

const React = {
  Fragment: 'fragment',
  createElement(type, props, ...children) {
    return { children, props: props ?? {}, type };
  },
};

test('media sources are opaque runtime strings preserved without coercion or normalization', () => {
  const sources = Object.freeze({
    Audio: 'opaque audio resource with spaces',
    Image: 'asset+private://image/%2F?token=a+b#雪',
    Video: './host-owned/video/%2e%2e/clip',
  });
  const units = [
    [Image, sources.Image],
    [Video, sources.Video],
    [Audio, sources.Audio],
  ];

  for (const [MediaUnit, source] of units) {
    const original = Buffer.from(source, 'utf8');
    const unit = new MediaUnit(source);
    assert.equal(unit.source, source);
    assert.deepEqual(Buffer.from(unit.source, 'utf8'), original);

    for (const invalid of ['', null, undefined, 42, {}, 'resource\nslot', 'resource\u0000slot', 'resource\u007fslot']) {
      assert.throws(
        () => new MediaUnit(invalid),
        /opaque non-empty string without control characters/u,
      );
    }
  }
});

test('media Units retain typed runtime playback and crop data without backend objects', () => {
  const image = new Image('runtime-image', {
    decode: 'sync',
    fit: 'contain',
    position: { x: 0.25, y: 0.75 },
  });
  assert.deepEqual(image.position, { x: 0.25, y: 0.75 });
  assert.equal(image.decode, 'sync');

  const video = new Video('runtime-video', {
    backend: 'offthread-video',
    endAt: 72,
    loop: true,
    muted: false,
    playbackRate: 1.25,
    position: { x: 0.4, y: 0.6 },
    startFrom: 12,
    transparent: true,
    volume: 0.7,
  });
  assert.deepEqual(video.position, { x: 0.4, y: 0.6 });
  assert.equal(video.endAt, 72);
  assert.equal(video.loop, true);
  assert.equal(video.playbackRate, 1.25);
  assert.equal(video.transparent, true);
  assert.equal(video.volume, 0.7);

  const audio = new Audio('runtime-audio', {
    endAt: 54,
    loop: true,
    playbackRate: 0.9,
    startFrom: 6,
    volume: 0.35,
  });
  assert.deepEqual({
    endAt: audio.endAt,
    loop: audio.loop,
    playbackRate: audio.playbackRate,
    startFrom: audio.startFrom,
    volume: audio.volume,
  }, {
    endAt: 54,
    loop: true,
    playbackRate: 0.9,
    startFrom: 6,
    volume: 0.35,
  });
});

test('React stays native-thin while Remotion receives typed media timeline semantics', () => {
  const layer = new Layer(new Image('runtime-image', {
    decode: 'sync',
    position: { x: 0.2, y: 0.8 },
  }));
  layer.add(new Video('runtime-video', {
    endAt: 50,
    loop: true,
    muted: false,
    playbackRate: 1.5,
    position: { x: 0.3, y: 0.7 },
    startFrom: 5,
    volume: 0.6,
  }));
  layer.add(new Audio('runtime-audio', {
    endAt: 40,
    playbackRate: 0.75,
    startFrom: 4,
    volume: 0.25,
  }));
  const composition = new Composition(layer, { duration: 60, fps: 30 });

  const reactTree = createReactDriver(React).render(composition, { frame: 12 });
  const reactImage = find(reactTree, (node) => node.type === 'img');
  const reactVideo = find(reactTree, (node) => node.type === 'video');
  const reactAudio = find(reactTree, (node) => node.type === 'audio');
  assert.equal(reactImage.props.decoding, 'sync');
  assert.equal(reactImage.props.style.objectPosition, '20% 80%');
  assert.equal(reactVideo.props.style.objectPosition, '30% 70%');
  assert.equal(reactVideo.props.loop, true);
  assert.equal(reactAudio.props.loop, false);
  for (const native of [reactVideo, reactAudio]) {
    assert.equal(Object.hasOwn(native.props, 'preload'), false);
    assert.equal(Object.hasOwn(native.props, 'ref'), false);
    assert.equal(Object.hasOwn(native.props, 'data-frame'), false);
    assert.equal(Object.hasOwn(native.props, 'data-start-frame'), false);
  }

  const remotionTree = createRemotionDriver(React, {
    Audio: 'remotion-audio',
    Img: 'remotion-image',
    OffthreadVideo: 'remotion-video',
    Sequence: 'remotion-sequence',
  }).render(composition, { frame: 12 });
  const remotionVideo = find(remotionTree, (node) => node.type === 'remotion-video');
  const remotionAudio = find(remotionTree, (node) => node.type === 'remotion-audio');
  assert.deepEqual(pick(remotionVideo.props, [
    'startFrom', 'endAt', 'loop', 'playbackRate', 'volume', 'muted',
  ]), {
    startFrom: 5,
    endAt: 50,
    loop: true,
    playbackRate: 1.5,
    volume: 0.6,
    muted: false,
  });
  assert.deepEqual(pick(remotionAudio.props, [
    'startFrom', 'endAt', 'loop', 'playbackRate', 'volume', 'muted',
  ]), {
    startFrom: 4,
    endAt: 40,
    loop: false,
    playbackRate: 0.75,
    volume: 0.25,
    muted: false,
  });
});

test('media Units fail closed on invalid crop and playback domains', () => {
  assert.throws(() => new Image('runtime', { position: { x: 1.1 } }), /between zero and one/u);
  assert.throws(() => new Video('runtime', { endAt: 3, startFrom: 4 }), /greater/u);
  assert.throws(() => new Video('runtime', { volume: -0.1 }), /between zero and one/u);
  assert.throws(() => new Video('runtime', { transparent: 'yes' }), /must be a boolean/u);
  assert.throws(
    () => new Video('runtime', { backend: 'video', transparent: true }),
    /requires an offthread-video backend/u,
  );
  assert.throws(() => new Audio('runtime', { playbackRate: 0 }), /greater than zero/u);
  assert.throws(() => new Audio('runtime', { startFrom: -1 }), /non-negative/u);
});

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
