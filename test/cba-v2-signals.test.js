import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCompositionV2 } from '../src/cba-v2/compiler.js';
import { normalizeCbaV2Features } from '../src/cba-v2/features.js';
import { verifyCompositionV2 } from '../src/cba-v2/verifier.js';

const video = { fps: 10, width: 1080, height: 1920, lengthMs: 1100 };
const source = `
  const GeneratedComposition = () => {
    const frame = useCurrentFrame();
    const {durationInFrames} = useVideoConfig();
    const opacity = Math.round(interpolate(
      frame,
      [0, durationInFrames - 1],
      [0, 100],
      {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      },
    )) / 100;
    return <div style={{
      opacity,
      transform: \`translateY(\${interpolate(frame, [0, durationInFrames - 1], [20, 0])}px) scale(\${1 + frame / 100})\`,
    }} />;
  };
`;

test('declarative Signal capability removes per-formula classes without changing any frame', () => {
  const result = compileCompositionV2(source);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.matchedFrames, verification.totalFrames);
  assert.equal(verification.maximumNativeUnits, 0);
  assert.equal(verification.maximumLocalBehaviours, 0);
  assert.deepEqual(verification.publicBehaviourKinds, [
    'behaviour.opacity', 'behaviour.scale', 'behaviour.translate',
  ]);
  assert.doesNotMatch(result.program, /class Local\w+Behaviour/u);
  assert.match(result.program, /import \{ Computed, ContextValue, Interpolation, RecordValue \}/u);
  assert.equal(result.escapeHatches.localBehaviours, 0);
});

test('declarativeSignalIr is independently feature-controlled for profile search', () => {
  const result = compileCompositionV2(source, {
    features: normalizeCbaV2Features({ declarativeSignalIr: false }),
  });
  assert.ok(result.escapeHatches.localBehaviours > 0);
  assert.match(result.program, /class LocalOpacityBehaviour\d+ extends Behaviour/u);
  assert.doesNotMatch(result.program, /new Interpolation/u);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, 11);
});

test('locally shadowed interpolation code is never promoted to built-in Signal IR', () => {
  const result = compileCompositionV2(`
    const interpolate = (value) => value / 10;
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{opacity: interpolate(frame)}} />;
    };
  `);
  assert.equal(result.memoryCandidates.behaviours.length, 0);
  assert.doesNotMatch(result.program, /new Interpolation/u);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, 11);
});

test('piecewise interpolation agrees at the first, inner and final range boundaries', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{
        opacity: interpolate(frame, [0, 5, 10], [0.1, 0.9, 0.2], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        }),
      }} />;
    };
  `);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.matchedFrames, 11);
  assert.equal(verification.exact, true);
});
