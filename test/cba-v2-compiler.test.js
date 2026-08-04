import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('v2 emits public atomic Behaviours with callback-free declarative Signals', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{
        opacity: frame / 12,
        transform: \`translateX(\${frame * 2}px) scale(\${1 + frame / 100}) rotate(\${frame}deg)\`,
      }} />;
    };
  `);
  assert.doesNotMatch(result.program, /import \{ Behaviour \}/);
  assert.doesNotMatch(result.program, /class Local(?:Opacity|Scale|Translate|Rotate)Behaviour/);
  assert.match(result.program, /import \{ Computed, ContextValue, RecordValue \}/);
  assert.match(result.program, /import \{ Opacity \}/);
  assert.match(result.program, /import \{ Scale \}/);
  assert.match(result.program, /import \{ Translate \}/);
  assert.match(result.program, /import \{ Rotate \}/);
  assert.match(result.program, /from "@cut3\/agent-memory\/cba-v2\/runtime"/u);
  assert.doesNotMatch(result.program, /from "\.\.\/\.\.\//u);
  assert.match(result.program, /new __v2BoxUnit/);
  assert.match(result.program, /new __v2GroupUnit/);
  assert.doesNotMatch(result.program, /new NativeUnit/);
  assert.match(result.program, /\.addBehaviour\(new Opacity\(/);
  assert.match(result.program, /\.addBehaviour\(new Scale\(/);
  assert.match(result.program, /\.addBehaviour\(new Translate\(/);
  assert.match(result.program, /\.addBehaviour\(new Rotate\(/);
  assert.doesNotMatch(result.program, /=>\s*read(?:Style|Transform)/);
  assert.doesNotMatch(result.program, /factoryMaps?|loadFactory|dynamic import|backend\s*:/i);
  assert.deepEqual(result.inventory.behaviours.map(({ kind }) => kind),
    ['opacity', 'translate', 'scale', 'rotate']);
  assert.deepEqual(result.memoryCandidates.units, [
    { kind: 'unit.box', className: 'Box' },
    { kind: 'unit.group', className: 'Group' },
  ]);
  assert.deepEqual(result.memoryCandidates.behaviours, [
    { kind: 'opacity', className: 'Opacity' },
    { kind: 'translate', className: 'Translate' },
    { kind: 'scale', className: 'Scale' },
    { kind: 'rotate', className: 'Rotate' },
  ]);
  assert.equal(result.escapeHatches.localBehaviours, 0);
  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.equal(result.verification.generatedParse, true);
  assert.equal(verifyCompositionV2(result, video).exact, true);
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
  assert.ok(result.inventory.units.every(({ implementation }) => implementation === 'native'));
  assert.deepEqual(result.memoryCandidates.units, []);
  assert.doesNotMatch(result.program, /addBehaviour/);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('safe element shapes lower to direct public Unit classes with witnessed coverage', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => (
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        <div style={{display: 'flex'}}>
          <Img src="asset.jpg" style={{width: '100%'}} />
          <span style={{color: 'white'}}>CUT3</span>
        </div>
        <Audio src="sound.mp3" />
        <OffthreadVideo src="clip.mp4" muted transparent style={{width: '100%'}} />
      </AbsoluteFill>
    );
  `);
  assert.deepEqual(result.memoryCandidates.units, [
    { className: 'Audio', kind: 'unit.audio' },
    { className: 'Box', kind: 'unit.box' },
    { className: 'Group', kind: 'unit.group' },
    { className: 'Image', kind: 'unit.image' },
    { className: 'Layer', kind: 'unit.layer' },
    { className: 'Text', kind: 'unit.text' },
    { className: 'Video', kind: 'unit.video' },
  ]);
  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.doesNotMatch(result.program, /\bnew NativeUnit\b/u);
  assert.match(result.program, /import \{ Layer as __v2LayerUnit \}/u);
  assert.match(result.program, /import \{ renderLayer as __v2RenderLayer \}/u);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.exact, true);
  assert.equal(verification.maximumPublicUnits, 8);
  assert.equal(verification.maximumNativeUnits, 0);
  assert.deepEqual(verification.publicUnitKinds, [
    'unit.audio', 'unit.box', 'unit.group', 'unit.image', 'unit.layer', 'unit.text', 'unit.video',
  ]);
});

test('publishable ESM uses collision-free static Remotion component imports', () => {
  const result = compileCompositionV2(`
    const __v2RemotionAbsoluteFill = 'source-binding';
    const GeneratedComposition = () => (
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        <Img src="frame.png" style={{width: '100%'}} />
        <Audio src="voice.mp3" />
        <OffthreadVideo src="clip.mp4" muted transparent style={{width: '100%'}} />
      </AbsoluteFill>
    );
  `);

  assert.match(result.program,
    /import \{ AbsoluteFill as __v2RemotionAbsoluteFill_2, Audio as __v2RemotionAudio, Img as __v2RemotionImg, OffthreadVideo as __v2RemotionOffthreadVideo \} from "remotion";/u);
  assert.match(result.program, /layer: __v2RemotionAbsoluteFill_2/u);
  assert.match(result.program, /audio: __v2RemotionAudio/u);
  assert.match(result.program, /image: __v2RemotionImg/u);
  assert.match(result.program, /video: __v2RemotionOffthreadVideo/u);
  assert.doesNotMatch(result.program,
    /(?:layer|audio|image|video):\s*"(?:AbsoluteFill|Audio|Img|OffthreadVideo)"/u);
  assert.equal(result.verification.generatedParse, true);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, video.fps);
});

test('a differently imported Remotion component cannot spoof a canonical public Unit', () => {
  const result = compileCompositionV2(`
    import {Video as OffthreadVideo} from 'remotion';
    const GeneratedComposition = () => (
      <OffthreadVideo src="clip.mp4" muted transparent style={{width: '100%'}} />
    );
  `);

  assert.equal(result.escapeHatches.nativeUnits, 1);
  assert.deepEqual(result.memoryCandidates.units, []);
  assert.match(result.program, /new NativeUnit\(OffthreadVideo/u);
  assert.doesNotMatch(result.program, /new __v2VideoUnit/u);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, video.fps);
});

test('import-free Native Remotion components receive static ESM bindings', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => (
      <Sequence from={0} durationInFrames={12}>
        <div data-native="kept" />
      </Sequence>
    );
  `);

  assert.match(result.program, /import \{ Sequence \} from "remotion";/u);
  assert.match(result.program, /new NativeUnit\(Sequence/u);
  assert.equal(result.verification.unresolvedExternalCount, 0);
  assert.equal(result.verification.publishableEsm, true);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, video.fps);
});

test('unknown runtime globals fail the publishable-ESM gate without entering an import registry', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => {
      loadGoogleFont('Anton');
      return <div data-native="kept" />;
    };
  `);

  assert.equal(result.verification.unresolvedExternalCount, 1);
  assert.equal(result.verification.publishableEsm, false);
  assert.doesNotMatch(result.program, /loadFactory|import\s*\(/u);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, video.fps);
});

test('a dormant dynamic import fails the static-only publishable-ESM gate', () => {
  const result = compileCompositionV2(`
    const dormant = () => import('three');
    const GeneratedComposition = () => <div style={{color: 'red'}} />;
  `);

  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.equal(result.verification.dynamicImportCount, 1);
  assert.equal(result.verification.publishableEsm, false);
  assert.match(result.program, /import\('three'\)/u);
  assert.equal(verifyCompositionV2(result, video).matchedFrames, video.fps);
});

test('each renderer-neutral public Unit lowering is independently feature-controlled', () => {
  const source = `
    const GeneratedComposition = () => (
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        <div style={{display: 'flex'}}>
          <Img src="asset.jpg" style={{width: '100%'}} />
          <span style={{color: 'white'}}>CUT3</span>
        </div>
        <Audio src="sound.mp3" />
        <OffthreadVideo src="clip.mp4" muted transparent style={{width: '100%'}} />
      </AbsoluteFill>
    );
  `;
  const controlledClasses = new Map([
    ['publicGroupUnit', 'Group'],
    ['publicBoxUnit', 'Box'],
    ['publicLayerUnit', 'Layer'],
    ['publicLabelUnit', 'Text'],
    ['publicImageUnit', 'Image'],
    ['publicAudioUnit', 'Audio'],
    ['publicVideoUnit', 'Video'],
  ]);

  for (const [feature, className] of controlledClasses) {
    const result = compileCompositionV2(source, {
      features: normalizeCbaV2Features({ [feature]: false }),
    });
    assert.equal(
      result.memoryCandidates.units.some((candidate) => candidate.className === className),
      false,
      feature,
    );
    assert.ok(result.escapeHatches.nativeUnits > 0, feature);
    assert.equal(verifyCompositionV2(result, video).exact, true, feature);
  }
});

test('collection children lower to Group plus primitive TextNode without wrappers', () => {
  const source = `
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{display: 'flex'}}>{frame % 2
        ? ['A', 2, null, false]
        : [[undefined, 'B'], 3, true]}</div>;
    };
  `;
  const result = compileCompositionV2(source);
  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.deepEqual(result.memoryCandidates.units, [
    { className: 'Box', kind: 'unit.box' },
    { className: 'Group', kind: 'unit.group' },
    { className: 'TextNode', kind: 'unit.text-node' },
  ]);
  assert.match(result.program, /import \{ TextNode as __v2TextNodeUnit \}/u);
  assert.match(result.program, /function __v2NormalizeUnitChildren/u);
  assert.doesNotMatch(result.program, /factory|dynamic import|loadFactory/iu);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.exact, true);
  assert.equal(verification.maximumNativeUnits, 0);
  assert.deepEqual(verification.publicUnitKinds, [
    'unit.box', 'unit.group', 'unit.text-node',
  ]);

  for (const disabled of ['collectionChildren', 'primitiveChildUnit']) {
    const fallback = compileCompositionV2(source, {
      features: normalizeCbaV2Features({ [disabled]: false }),
    });
    assert.ok(fallback.escapeHatches.nativeUnits > 0, disabled);
    assert.equal(fallback.memoryCandidates.units.some(({ className }) => className === 'TextNode'), false);
    assert.equal(verifyCompositionV2(fallback, video).exact, true, disabled);
  }
});

test('collection lowering rejects children outside its closed static grammar', () => {
  const cases = [
    'const child = {}; return <div style={{display:"flex"}}>{child}</div>;',
    'const child = () => "value"; return <div style={{display:"flex"}}>{child}</div>;',
    'return <div style={{display:"flex"}}>{props.child}</div>;',
    'const values = props.values; return <div style={{display:"flex"}}>{values.map((value) => <span style={{color:"red"}}>x</span>)}</div>;',
  ];
  for (const body of cases) {
    const result = compileCompositionV2(`
      const GeneratedComposition = (props = {}) => { ${body} };
    `);
    assert.equal(
      result.inventory.units.find(({ tag }) => tag === 'div')?.className,
      'NativeUnit',
      body,
    );
    assert.equal(result.memoryCandidates.units.some(({ className }) => className === 'TextNode'), false);
    assert.equal(verifyCompositionV2(result, video, {
      props: { child: 'runtime', values: ['a'] },
    }).exact, true, body);
  }
});

test('block-bodied map callbacks remain Native when every return path is not proven', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => (
      <div style={{display: 'flex'}}>
        {[1, 2].map((value) => {
          if (value === 1) return {};
          return <span style={{color: 'red'}}>safe</span>;
        })}
      </div>
    );
  `);
  assert.equal(
    result.inventory.units.find(({ tag }) => tag === 'div')?.className,
    'NativeUnit',
  );
  assert.equal(verifyCompositionV2(result, video).exact, true);

  const asyncResult = compileCompositionV2(`
    const GeneratedComposition = () => (
      <div style={{display: 'flex'}}>
        {[1].map(async () => <span style={{color: 'red'}}>unsafe</span>)}
      </div>
    );
  `);
  assert.equal(
    asyncResult.inventory.units.find(({ tag }) => tag === 'div')?.className,
    'NativeUnit',
  );

  const overriddenMap = compileCompositionV2(`
    const values = [1];
    values.map = () => ['runtime'];
    const GeneratedComposition = () => (
      <div style={{display: 'flex'}}>
        {values.map(() => <span style={{color: 'red'}}>ignored</span>)}
      </div>
    );
  `);
  assert.equal(
    overriddenMap.inventory.units.find(({ tag }) => tag === 'div')?.className,
    'NativeUnit',
  );
  assert.equal(verifyCompositionV2(overriddenMap, video).exact, true);
});

test('collection normalization does not import TextNode when only empty children are possible', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => (
      <div style={{display: 'flex'}}>{[null, false, undefined, [true]]}</div>
    );
  `, {
    features: normalizeCbaV2Features({ primitiveChildUnit: false }),
  });
  assert.deepEqual(result.memoryCandidates.units, [
    { className: 'Box', kind: 'unit.box' },
    { className: 'Group', kind: 'unit.group' },
  ]);
  assert.match(result.program, /function __v2NormalizeUnitChildren/u);
  assert.doesNotMatch(result.program, /TextNode|__v2TextNodeUnit/u);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('bounded Array.from cards lower to reusable Units without cardinality-specific classes', () => {
  const result = compileCompositionV2(`
    const WORDS = [{text: 'ONE'}, {text: 'TWO'}];
    const GeneratedComposition = () => (
      <AbsoluteFill style={{background: 'black'}}>
        {Array.from({length: 3}, (_, p) => {
          const i = p;
          if (i >= WORDS.length) return null;
          let active = -1;
          for (let j = 0; j < 1; j += 1) active = j;
          const fontSize = Math.max(12, WORDS[i].text.length * 8 + active);
          return (
            <div key={i} style={{fontSize, left: active + 1}}>
              {WORDS[i].text}
            </div>
          );
        })}
      </AbsoluteFill>
    );
  `);

  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.deepEqual(result.memoryCandidates.units, [
    { className: 'Box', kind: 'unit.box' },
    { className: 'Group', kind: 'unit.group' },
    { className: 'Layer', kind: 'unit.layer' },
    { className: 'TextNode', kind: 'unit.text-node' },
  ]);
  const verification = verifyCompositionV2(result, video);
  assert.equal(verification.exact, true);
  assert.equal(verification.maximumNativeUnits, 0);
  assert.ok(verification.maximumPublicUnits > 3);
  assert.doesNotMatch(result.program, /ThreeCards|card-count|NativeUnit/u);
});

test('collection lowering fails closed for non-empty alternate returns and shadowed Array.from', () => {
  const sources = [
    `
      const Local = () => <div style={{color: 'red'}} />;
      const GeneratedComposition = () => (
        <AbsoluteFill style={{}}>
          {Array.from({length: 2}, (_, index) => {
            if (index === 0) return <Local />;
            return <div style={{color: 'white'}}>safe</div>;
          })}
        </AbsoluteFill>
      );
    `,
    `
      const Array = {from: (_value, callback) => [callback(null, 0)]};
      const GeneratedComposition = () => (
        <AbsoluteFill style={{}}>
          {Array.from({length: 1}, (_, index) => (
            <div style={{left: index}}>safe</div>
          ))}
        </AbsoluteFill>
      );
    `,
  ];
  for (const source of sources) {
    const result = compileCompositionV2(source);
    assert.ok(result.escapeHatches.nativeUnits > 0);
    assert.equal(verifyCompositionV2(result, video).exact, true);
  }
});

test('static member lowering rejects getters, spreads and duplicate object keys', () => {
  const sources = [
    `
      const payload = {label: {unsafe: true}};
      const values = [{...payload}];
      const GeneratedComposition = () => <div style={{}}>
        {values.map((_, index) => <div style={{}}>{values[index].label}</div>)}
      </div>;
    `,
    `
      const values = [{get label() { return {unsafe: true}; }}];
      const GeneratedComposition = () => <div style={{}}>
        {values.map((_, index) => <div style={{}}>{values[index].label}</div>)}
      </div>;
    `,
    `
      const values = [{label: 'safe', label: {unsafe: true}}];
      const GeneratedComposition = () => <div style={{}}>
        {values.map((_, index) => <div style={{}}>{values[index].label}</div>)}
      </div>;
    `,
  ];
  for (const source of sources) {
    const result = compileCompositionV2(source);
    assert.ok(result.inventory.units.some(({ className }) => className === 'NativeUnit'));
    assert.equal(verifyCompositionV2(result, video).exact, true);
  }
});

test('literal collection inference rejects direct, method and alias mutations', () => {
  const mutations = [
    'values[0].label = {unsafe: true};',
    'values.push({label: {unsafe: true}});',
    'const alias = values; alias[0].label = {unsafe: true};',
    'const mutate = (value) => { value.label = {unsafe: true}; }; mutate(values[0]);',
  ];
  for (const mutation of mutations) {
    const result = compileCompositionV2(`
      const values = [{label: 'safe'}];
      ${mutation}
      const GeneratedComposition = () => <div style={{}}>
        {values.map((_, index) => <div style={{}}>{values[index].label}</div>)}
      </div>;
    `);
    assert.ok(result.escapeHatches.nativeUnits > 0, mutation);
    assert.equal(verifyCompositionV2(result, video).exact, true, mutation);
  }
});

test('reading an immutable literal member through a pure helper preserves public lowering', () => {
  const result = compileCompositionV2(`
    const values = [{offset: 1, label: 'safe'}];
    const identity = (value) => value;
    const GeneratedComposition = () => <div style={{}}>
      {values.map((_, index) => {
        if (identity(values[index].offset) < 0) return null;
        return <div style={{left: index}}>{values[index].label}</div>;
      })}
    </div>;
  `);
  assert.equal(result.escapeHatches.nativeUnits, 0);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('block callback analysis sees direct early returns before the final JSX return', () => {
  const result = compileCompositionV2(`
    const GeneratedComposition = () => <div style={{}}>
      {[1].map(() => {
        return {unsafe: true};
        return <span style={{}}>unreachable</span>;
      })}
    </div>;
  `);
  assert.equal(result.inventory.units.find(({ tag }) => tag === 'div')?.className, 'NativeUnit');
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('collection index inference rejects custom map indexes and reassigned native indexes', () => {
  const sources = [
    `
      const values = {map(callback) { return [callback(null, () => {})]; }};
      const GeneratedComposition = () => <div style={{}}>
        {values.map((_, index) => <div style={{left: index}}>x</div>)}
      </div>;
    `,
    `
      const GeneratedComposition = () => <div style={{}}>
        {[1].map((_, index) => {
          index = () => {};
          return <div style={{left: index}}>x</div>;
        })}
      </div>;
    `,
    `
      const GeneratedComposition = () => {
        const prototype = [].__proto__;
        const nativeMap = prototype.map;
        try {
          prototype.map = function map(callback) { return [callback(null, () => {})]; };
          return <div style={{}}>
            {[1].map((_, index) => <div style={{left: index}}>x</div>)}
          </div>;
        } finally {
          prototype.map = nativeMap;
        }
      };
    `,
  ];
  for (const source of sources) {
    const result = compileCompositionV2(source);
    assert.ok(result.inventory.units.some(({ tag, className }) => (
      tag === 'div' && className === 'NativeUnit'
    )));
    assert.equal(verifyCompositionV2(result, video).exact, true);
  }
});

test('global Array.from pollution fails closed inside a disposable process', () => {
  const script = `
    import { compileCompositionV2 } from './src/cba-v2/compiler.js';
    import { verifyCompositionV2 } from './src/cba-v2/verifier.js';
    const sources = [
      \`
        Array.from = (_source, callback) => [callback(null, () => {})];
        const GeneratedComposition = () => <div style={{}}>
          {Array.from({length: 1}, (_, index) => <div style={{left: index}}>x</div>)}
        </div>;
      \`,
      \`
        globalThis.Array.from = (_source, callback) => [callback(null, () => {})];
        const GeneratedComposition = () => <div style={{}}>
          {Array.from({length: 1}, (_, index) => <div style={{left: index}}>x</div>)}
        </div>;
      \`,
      \`
        globalThis['Array'].from = (_source, callback) => [callback(null, () => {})];
        const GeneratedComposition = () => <div style={{}}>
          {Array.from({length: 1}, (_, index) => <div style={{left: index}}>x</div>)}
        </div>;
      \`,
    ];
    for (const source of sources) {
      const nativeFrom = Array.from;
      try {
        const result = compileCompositionV2(source);
        if (!result.inventory.units.some(({className}) => className === 'NativeUnit')) {
          throw new Error('polluted Array.from was promoted');
        }
        const verification = verifyCompositionV2(
          result,
          {fps: 2, width: 10, height: 10, lengthMs: 1000},
        );
        if (!verification.exact) throw new Error('Native fallback was not exact');
      } finally {
        Array.from = nativeFrom;
      }
    }
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
});

test('non-finite style inference and post-construction alias mutation fail closed', () => {
  const sources = [
    'const GeneratedComposition = () => <div style={{left: Math.sqrt(-1)}} />;',
    `
      const GeneratedComposition = () => {
        let value = 1;
        value /= 0;
        return <div style={{left: value}} />;
      };
    `,
    `
      const style = {color: 'red'};
      const alias = style;
      const GeneratedComposition = () => {
        const element = <div style={style} />;
        alias.color = 'blue';
        return element;
      };
    `,
    `
      const style = {color: 'red'};
      const holder = {style};
      const GeneratedComposition = () => {
        const element = <div style={style} />;
        holder.style.color = 'blue';
        return element;
      };
    `,
  ];
  for (const source of sources) {
    const result = compileCompositionV2(source);
    assert.equal(result.inventory.units[0].className, 'NativeUnit');
    assert.equal(verifyCompositionV2(result, video).exact, true);
  }
});

test('numeric range inference rejects finite operands whose product can overflow', () => {
  const expressions = ['index * 1e308', 'Math.fround(index * 1e39)'];
  for (const expression of expressions) {
    const result = compileCompositionV2(`
      const GeneratedComposition = () => <div style={{}}>
        {Array.from({length: 3}, (_, index) => (
          <div style={{left: ${expression}}}>x</div>
        ))}
      </div>;
    `);
    assert.ok(result.inventory.units.some(({ className }) => className === 'NativeUnit'));
    assert.equal(verifyCompositionV2(result, video).exact, true);
  }
});

test('public styled Units require a statically proven plain style value', () => {
  const cases = [
    { tag: 'div', element: '<div style={props.style} />' },
    { tag: 'span', element: '<span style={props.style}>label</span>' },
    { tag: 'AbsoluteFill', element: '<AbsoluteFill style={props.style} />' },
    { tag: 'Img', element: '<Img src="asset.jpg" style={props.style} />' },
    { tag: 'OffthreadVideo', element: '<OffthreadVideo src="clip.mp4" style={props.style} />' },
  ];
  for (const { tag, element } of cases) {
    const result = compileCompositionV2(`
      const GeneratedComposition = (props) => ${element};
    `);
    assert.equal(
      result.inventory.units.find((unit) => unit.tag === tag)?.className,
      'NativeUnit',
      tag,
    );
    assert.equal(verifyCompositionV2(result, video, {
      props: { style: () => ({ color: 'red' }) },
    }).exact, true, tag);
  }

  const mutatedStyle = compileCompositionV2(`
    const style = {color: 'red'};
    style.color = () => 'blue';
    const GeneratedComposition = () => <div style={style} />;
  `);
  assert.equal(mutatedStyle.inventory.units[0].className, 'NativeUnit');
  assert.equal(verifyCompositionV2(mutatedStyle, video).exact, true);
});

test('explicit default video playback rate and empty media sources stay Native', () => {
  const explicitDefault = compileCompositionV2(`
    const GeneratedComposition = () => (
      <OffthreadVideo src="clip.mp4" playbackRate={1} style={{width: '100%'}} />
    );
  `);
  assert.equal(explicitDefault.inventory.units[0].className, 'NativeUnit');
  assert.equal(verifyCompositionV2(explicitDefault, video).exact, true);

  const emptySources = [
    '<Img src="" style={{width: "100%"}} />',
    '<Audio src="" />',
    '<OffthreadVideo src="" style={{width: "100%"}} />',
  ];
  for (const element of emptySources) {
    const result = compileCompositionV2(`const GeneratedComposition = () => ${element};`);
    assert.equal(result.inventory.units[0].className, 'NativeUnit', element);
    assert.equal(verifyCompositionV2(result, video).exact, true, element);
  }
});

test('opaque elements, local components and timeline wrappers stay native', () => {
  const result = compileCompositionV2(`
    const LocalCard = () => <div style={{color: 'white'}} />;
    const GeneratedComposition = ({show}) => (
      <AbsoluteFill style={{background: 'black'}}>
        <div onClick={() => {}} style={{display: 'block'}} />
        {show && <div style={{opacity: 0.5}} />}
        <LocalCard />
        <Sequence from={10}><div style={{color: 'red'}} /></Sequence>
      </AbsoluteFill>
    );
  `);
  assert.ok(result.escapeHatches.nativeUnits >= 3);
  assert.ok(result.inventory.units.some(({ tag, className }) => tag === 'LocalCard' && className === 'NativeUnit'));
  assert.ok(result.inventory.units.some(({ tag, className }) => tag === 'Sequence' && className === 'NativeUnit'));
  assert.equal(verifyCompositionV2(result, video, { props: { show: true } }).exact, true);
});

test('partial transform extraction remains Native because its residual operation plan is private', () => {
  const result = compileCompositionV2(profileSource, {
    features: normalizeCbaV2Features({
      opacityTween: true,
      opacityFormula: false,
      scaleFormula: true,
      translateFormula: false,
      rotateFormula: false,
    }),
  });
  assert.equal(result.inventory.units[0].className, 'NativeUnit');
  assert.equal(result.escapeHatches.nativeUnits, 1);
  assert.equal(verifyCompositionV2(result, video).exact, true);
});

test('bounded search profiles are unique, capability-bearing, deterministic and semantically exact', () => {
  assert.equal(CBA_V2_PROFILES.length, 96);
  assert.equal(new Set(CBA_V2_PROFILES.map(({ id }) => id)).size, 96);
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
  assert.equal(featureFingerprints.size, 96);
  assert.ok(CBA_V2_PROFILES.some(({ features }) => (
    FEATURE_KEYS.every((key) => features[key] === true)
  )));
  for (const key of FEATURE_KEYS) {
    assert.ok(CBA_V2_PROFILES.some(({ features }) => (
      FEATURE_KEYS.every((candidateKey) => features[candidateKey] === (candidateKey === key))
    )), key);
  }
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
