import assert from 'node:assert/strict';
import test from 'node:test';

import { compileComposition } from '../src/cba/compiler.js';
import { verifyAllFrames } from '../src/cba/semantic-harness.js';

const options = { runtimeImport: './runtime.js', libraryImport: './library.js' };

test('nested map becomes Repeat Unit while leaf animations remain atomic', () => {
  const source = `
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div>{[1, 2].map((item) => (
        <span style={{ opacity: frame / 10, transform: \`scale(\${frame}) translateX(\${frame}px)\` }}>
          {item}
        </span>
      ))}</div>;
    };
  `;
  const result = compileComposition(source, options);
  assert.equal(result.factories.units['unit.control.repeat'], 1);
  assert.equal(result.factories.behaviours['behaviour.css.opacity'], 1);
  assert.equal(result.factories.behaviours['behaviour.transform.scale'], 1);
  assert.equal(result.factories.behaviours['behaviour.transform.translate'], 1);
  assert.equal(result.factories.behaviours['behaviour.content.value'], undefined);
  assert.equal(result.verification.structuralTransformExact, true);
});

test('style identifier resolves into separate scale, translate and rotate Behaviours', () => {
  const source = `
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      const style = { transform: \`translateX(\${frame}px) rotate(\${frame}deg) scale(\${frame})\` };
      return <div style={style} />;
    };
  `;
  const result = compileComposition(source, options);
  assert.equal(result.factories.behaviours['behaviour.transform.scale'], 1);
  assert.equal(result.factories.behaviours['behaviour.transform.translate'], 1);
  assert.equal(result.factories.behaviours['behaviour.transform.rotate'], 1);
});

test('frame-aware Canvas and Three effects get renderer-specific Behaviours', () => {
  const canvas = compileComposition(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame(); const ref = useRef(null);
      useEffect(() => { ref.current.getContext('2d').fillRect(frame, 0, 1, 1); }, [frame]);
      return <canvas ref={ref} />;
    };
  `, options);
  assert.equal(canvas.factories.behaviours['behaviour.canvas.draw'], 1);

  const three = compileComposition(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame(); const groupRef = useRef(null);
      useEffect(() => { groupRef.current.rotation.x = frame; }, [frame]);
      return <ThreeCanvas><group ref={groupRef} /></ThreeCanvas>;
    };
  `, options);
  assert.equal(three.factories.behaviours['behaviour.three.effect'], 1);
});

test('unreachable Three helper does not pull Three factories into a DOM composition', () => {
  const result = compileComposition(`
    const Unused = () => <ThreeCanvas><mesh /></ThreeCanvas>;
    const GeneratedComposition = () => <div />;
  `, options);
  assert.deepEqual(result.factories.units, { 'unit.dom.element': 1 });
});

test('explicit React.createElement is lowered as a Unit and visual sinks are counted', () => {
  const result = compileComposition(`
    const GeneratedComposition = () => React.createElement(
      'div', { style: { opacity: useCurrentFrame() / 10 } }, useCurrentFrame()
    );
  `, options);
  assert.equal(result.verification.jsxUnits.complete, true);
  assert.equal(result.verification.visualSinks.expected, 2);
  assert.equal(result.program.includes('__cba.element'), true);
  assert.equal('complete' in result.verification, false);
});

test('all-frame semantic harness compares original and CBA trees', () => {
  const result = compileComposition(`
    const GeneratedComposition = () => {
      const frame = useCurrentFrame();
      return <div style={{ opacity: frame / 10 }}>frame {frame}</div>;
    };
  `, options);
  const verification = verifyAllFrames(result, {
    fps: 10, width: 100, height: 100, lengthMs: 500,
  });
  assert.equal(verification.exact, true);
  assert.equal(verification.matchedFrames, 5);
  assert.equal(verification.maximumOrphanBehaviours, 0);
  assert.equal(verification.fallbackBehaviours, 0);
});
