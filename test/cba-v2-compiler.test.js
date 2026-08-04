import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCompositionV2 } from '../src/cba-v2/compiler.js';
import {
  CBA_V2_BASELINE_PROFILE,
  CBA_V2_FEATURE_DEFAULTS,
  CBA_V2_PROFILES,
  FEATURE_KEYS,
  normalizeCbaV2Features,
} from '../src/cba-v2/features.js';
import { verifyCompositionV2 } from '../src/cba-v2/verifier.js';

const video = { fps: 12, width: 1080, height: 1920, lengthMs: 1000 };
const profileSource = `
  const GeneratedComposition = () => {
    const frame = useCurrentFrame();
    return <div style={{
      opacity: interpolate(frame, [0, 11], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      }),
      transform: \`translateX(\${frame}px) scale(\${1 + frame / 100}) rotate(\${frame}deg)\`,
    }} />;
  };
`;

test('v2 emits owner-bound atomic local Behaviours for arbitrary formulas', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{
        opacity: frame / 12,
        transform: \`translateX(\${frame * 2}px) scale(\${1 + frame / 100}) rotate(\${frame}deg)\`,
      }} />;
    };
  `);
  assert.match(result.program, /import \{ Behaviour \}/);
  assert.match(result.program, /class LocalOpacityBehaviour\d+ extends Behaviour/);
  assert.match(result.program, /class LocalScaleBehaviour\d+ extends Behaviour/);
  assert.match(result.program, /class LocalTranslateBehaviour\d+ extends Behaviour/);
  assert.match(result.program, /class LocalRotateBehaviour\d+ extends Behaviour/);
  assert.match(result.program, /new NativeUnit/);
  assert.match(result.program, /\.addBehaviour\(new LocalOpacityBehaviour\d+\(/);
  assert.match(result.program, /\.addBehaviour\(new LocalScaleBehaviour\d+\(/);
  assert.match(result.program, /\.addBehaviour\(new LocalTranslateBehaviour\d+\(/);
  assert.match(result.program, /\.addBehaviour\(new LocalRotateBehaviour\d+\(/);
  assert.doesNotMatch(result.program, /=>\s*read(?:Style|Transform)/);
  assert.doesNotMatch(result.program, /factoryMaps?|loadFactory|dynamic import|backend\s*:/i);
  assert.deepEqual(result.inventory.behaviours.map(({ kind }) => kind),
    ['opacity', 'translate', 'scale', 'rotate']);
  assert.deepEqual(result.memoryCandidates.units, []);
  assert.equal(result.memoryCandidates.behaviours.length, 0);
  assert.equal(result.escapeHatches.nativeUnits, 1);
  assert.equal(result.verification.generatedParse, true);
});

test('clamped linear interpolation becomes the reusable Opacity plus Tween classes', () => {
  const result = compileCompositionV2(`
    const font = loadGoogleFont();
    const samples = new Float32Array([0, 1]);
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div data-samples={samples.length} style={{
        fontFamily: font.fontFamily,
        opacity: interpolate(frame, [0, 11], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.linear,
        }),
      }} />;
    };
  `);
  assert.match(result.program, /import \{ Tween \}/);
  assert.match(result.program, /import \{ Opacity \}/);
  assert.match(result.program, /new Opacity\([^;]+new Tween\(/s);
  assert.equal(result.inventory.behaviours[0].implementation, 'library');
  assert.deepEqual(result.memoryCandidates.behaviours, [{ kind: 'opacity', className: 'Opacity' }]);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('all-frame verifier covers maps, local components, conditions and style aliases', () => {
  const source = `
    const Card = ({label, index}) => {
      const frame = useCurrentFrame();
      const style = {
        opacity: Math.min(1, frame / 5),
        transform: \`translateY(\${frame + index}px) scale(\${1 + frame / 100})\`,
      };
      return <article style={style}><b>{label}</b></article>;
    };
    const GeneratedComposition = ({items}) => {
      const frame = useCurrentFrame();
      const labels = React.useMemo(() => items, [items]);
      return <section>
        {labels.map((label, index) => <Card key={label} label={label} index={index} />)}
        {frame > 2 ? <footer>done</footer> : null}
      </section>;
    };
  `;
  const result = compileCompositionV2(source);
  const verification = verifyCompositionV2(result, video, { props: { items: ['one', 'two', 'three'] } });
  assert.equal(verification.exact, true);
  assert.equal(verification.matchedFrames, 12);
  assert.equal(verification.baselineRenderErrors, 0);
  assert.equal(verification.generatedRenderErrors, 0);
  assert.equal(verification.invalidBehaviourOwners, 0);
  assert.ok(result.inventory.behaviours.length >= 2);
});

test('all-frame verifier preserves nested transform arguments and interpolation', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      const x = interpolate(frame, [0, 11], [10, 110], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      });
      return <main style={{
        opacity: interpolate(frame, [0, 11], [0, 1]),
        transform: \`translate(calc(\${x}px), \${frame}px) rotate(\${frame * 3}deg)\`,
      }}><span>frame {frame}</span></main>;
    };
  `);
  assert.equal(result.inventory.behaviours.some(({ kind }) => kind === 'translate'), false);
  assert.equal(result.warnings.length, 1);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.exact, true);
  assert.equal(verification.matchedFrames, 12);
});

test('verifier error output is sanitized', () => {
  const verification = verifyCompositionV2({
    evaluationPrograms: {
      baseline: 'globalThis.__composition = () => { throw new TypeError("private transcript"); };',
      cba: 'globalThis.__composition = () => new NativeUnit("div", null);',
    },
  }, { fps: 2, width: 1, height: 1, lengthMs: 1000 });
  assert.equal(verification.exact, false);
  assert.equal(verification.baselineRenderErrors, 2);
  assert.equal(JSON.stringify(verification).includes('private transcript'), false);

  const effectProgram = `
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(0, 0, 0, 1, 1, 1);
    gradient.addColorStop(0, 'black');
    context.fillRect(0, 0, 1, 1);
    const image = new Image();
    const path = new Path2D();
    path.moveTo(0, 0);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0).bezierCurveTo(0, 1, 1, 1, 1, 0).closePath();
    const geometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2]), 3))
      .center();
    globalThis.__composition = () => React.createElement(
      ThreeCanvas,
      {canvas, geometry, image, path, shape},
      React.createElement('canvas'),
    );
  `;
  const effects = verifyCompositionV2({
    evaluationPrograms: { baseline: effectProgram, cba: effectProgram },
  }, { fps: 2, width: 1, height: 1, lengthMs: 1000 });
  assert.equal(effects.exact, false);
  assert.equal(effects.matchedFrames, 2);
  assert.deepEqual(effects.unsupportedEffects, ['canvas2d', 'three']);
  assert.equal(effects.mismatchCategory, 'UnsupportedEffects');
  assert.equal(effects.baselineRenderErrors, 0);
  assert.equal(effects.generatedRenderErrors, 0);

  const missingGlobal = verifyCompositionV2({
    evaluationPrograms: {
      baseline: 'globalThis.__composition = () => React.createElement("div");',
      cba: 'globalThis.__composition = () => React.createElement(NotDeclaredByVerifier);',
    },
  }, { fps: 1, width: 1, height: 1, lengthMs: 1000 });
  assert.equal(missingGlobal.generatedRenderErrors, 1);
  assert.equal(missingGlobal.firstMismatch.generatedDiagnostic, 'GeneratedProgram:MissingBinding');
  assert.equal(missingGlobal.mismatchCategory, 'GeneratedProgramError');
  assert.equal(JSON.stringify(missingGlobal).includes('NotDeclaredByVerifier'), false);
});

test('a local function named useCurrentFrame is not mistaken for the Remotion hook', () => {
  const result = compileCompositionV2(`
    const useCurrentFrame = () => 7;
    const GeneratedComposition = () => <div style={{ opacity: useCurrentFrame() / 10 }} />;
  `);
  assert.equal(result.inventory.behaviours.length, 0);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('markdown code fences are ingestion wrappers, not composition syntax', () => {
  const result = compileCompositionV2(`\`\`\`jsx
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{ opacity: frame / 12 }} />;
    };
  \`\`\``);
  assert.equal(result.verification.generatedParse, true);
  assert.equal(result.inventory.behaviours.length, 1);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('formula cloning preserves video-config destructuring and IIFE-local parameters', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      const {fps} = useVideoConfig();
      const opacity = ((value) => value / fps)(frame);
      return <div style={{opacity}} />;
    };
  `);
  assert.equal(result.inventory.behaviours.length, 1);
  assert.doesNotMatch(result.program, /this\.values\.(?:fps|value)/u);
  assert.match(result.program, /context\.fps/u);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('Tween promotion requires absolute frame input and genuinely linear easing', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = ({delay = 2}) => {
      const frame = useCurrentFrame();
      const shifted = frame - delay;
      const opacity = interpolate(shifted, [0, 11], [0, 1], {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      });
      return <div style={{opacity}} />;
    };
  `);
  assert.equal(result.inventory.behaviours[0].implementation, 'local');
  assert.doesNotMatch(result.program, /new Tween/u);
  assert.equal(verifyCompositionV2(result, video, { props: { delay: 3 } }).exact, true);
});

test('transform extraction preserves scientific-notation CSS numbers', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{transform: \`translateX(\${(frame + 1) * 1e-7}px)\`}} />;
    };
  `);
  assert.deepEqual(result.inventory.behaviours.map(({ kind }) => kind), ['translate']);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('all-off baseline keeps every visual sink native and remains exact', () => {
  const result = compileCompositionV2(profileSource, {
    features: CBA_V2_BASELINE_PROFILE.features,
  });
  assert.deepEqual(result.inventory.behaviours, []);
  assert.doesNotMatch(result.program, /addBehaviour/);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('twenty full profiles are unique, complete, deterministic and semantically exact', () => {
  assert.equal(CBA_V2_PROFILES.length, 20);
  assert.equal(new Set(CBA_V2_PROFILES.map(({ id }) => id)).size, 20);
  assert.equal(CBA_V2_PROFILES.some(({ id }) => id === CBA_V2_BASELINE_PROFILE.id), false);
  const featureFingerprints = new Set();
  for (const profile of CBA_V2_PROFILES) {
    assert.equal(Object.isFrozen(profile), true);
    assert.equal(Object.isFrozen(profile.features), true);
    assert.deepEqual(Object.keys(profile.features), FEATURE_KEYS);
    assert.equal(Object.values(profile.features).every((value) => typeof value === 'boolean'), true);
    featureFingerprints.add(FEATURE_KEYS.map((key) => Number(profile.features[key])).join(''));
    const left = compileCompositionV2(profileSource, { features: profile.features });
    const right = compileCompositionV2(profileSource, { features: profile.features });
    assert.equal(left.program, right.program, profile.id);
    assert.deepEqual(left.inventory, right.inventory, profile.id);
    assert.deepEqual(left.features, profile.features, profile.id);
    assert.equal(verifyCompositionV2(left, video).exact, true, profile.id);
  }
  assert.equal(featureFingerprints.size, 20);
});

test('opacity and scale promotions stay separate instead of becoming a combined fade-scale block', () => {
  const result = compileCompositionV2(profileSource, {
    features: normalizeCbaV2Features({
      opacityTween: true,
      opacityFormula: false,
      scaleFormula: true,
      translateFormula: false,
      rotateFormula: false,
    }),
  });
  assert.deepEqual(result.inventory.behaviours.map(({ kind }) => kind), ['opacity', 'scale']);
  assert.doesNotMatch(result.program, /FadeScale|ScaleFade|fade[-_. ]*scale/i);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('default feature behavior is unchanged and normalization returns a full profile', () => {
  const implicit = compileCompositionV2(profileSource);
  const explicit = compileCompositionV2(profileSource, { features: CBA_V2_FEATURE_DEFAULTS });
  assert.equal(implicit.program, explicit.program);
  assert.deepEqual(implicit.inventory, explicit.inventory);
  assert.deepEqual(implicit.features, CBA_V2_FEATURE_DEFAULTS);
  assert.deepEqual(normalizeCbaV2Features({ opacityTween: false }), {
    ...CBA_V2_FEATURE_DEFAULTS,
    opacityTween: false,
  });
  assert.deepEqual(implicit.inventory.behaviours.map(({ kind }) => kind),
    ['opacity', 'translate', 'scale', 'rotate']);
});
