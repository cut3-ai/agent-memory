import vm from 'node:vm';

import { Opacity } from '../../behaviours/opacity.js';
import { Rotate } from '../../behaviours/rotate.js';
import { Scale } from '../../behaviours/scale.js';
import { Translate } from '../../behaviours/translate.js';
import { Behaviour } from '../../core/Behaviour.js';
import {
  Computed,
  ContextValue,
  Interpolation,
  RecordValue,
  Tween,
} from '../../core/signals.js';
import { isUnit } from '../../core/Unit.js';
import { renderAudio } from '../../core/drivers/react/adapters/audio.js';
import { renderBox } from '../../core/drivers/react/adapters/box.js';
import { renderGroup } from '../../core/drivers/react/adapters/group.js';
import { renderImage } from '../../core/drivers/react/adapters/image.js';
import { renderLayer } from '../../core/drivers/react/adapters/layer.js';
import { renderText } from '../../core/drivers/react/adapters/text.js';
import { renderTextNode } from '../../core/drivers/react/adapters/text-node.js';
import { renderVideo } from '../../core/drivers/react/adapters/video.js';
import { Audio as AudioUnit } from '../../units/audio.js';
import { Box } from '../../units/box.js';
import { Group } from '../../units/group.js';
import { Image as ImageUnit } from '../../units/image.js';
import { Layer } from '../../units/layer.js';
import { Text as TextUnit } from '../../units/text.js';
import { TextNode } from '../../units/text-node.js';
import { Video as VideoUnit } from '../../units/video.js';
import {
  NATIVE_FRAGMENT,
  NativeUnit,
  plainVisualValue,
  readElementProp,
  readStyleValue,
  readTransformSignal,
  renderNativeTree,
  stripVisualStyle,
  tweenOptions,
  unitsOption,
} from './runtime/index.js';

const UNIT_CLASSES = Object.freeze({
  Audio: AudioUnit,
  Box,
  Group,
  Image: ImageUnit,
  Layer,
  Text: TextUnit,
  TextNode,
  Video: VideoUnit,
});
const UNIT_ADAPTERS = Object.freeze({
  renderAudio,
  renderBox,
  renderGroup,
  renderImage,
  renderLayer,
  renderText,
  renderTextNode,
  renderVideo,
});

/** Compare the source and emitted class graph at every timeline frame. */
export function verifyCompositionV2(compilation, video, options = {}) {
  const totalFrames = Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps));
  let baseline;
  let generated;
  try {
    baseline = createEvaluator('baseline', compilation, video, options.props ?? {});
    generated = createEvaluator('cba', compilation, video, options.props ?? {});
  } catch (error) { return failed(totalFrames, 'EvaluatorSetupError', error); }

  let matchedFrames = 0;
  let baselineRenderErrors = 0;
  let generatedRenderErrors = 0;
  let firstMismatch = null;
  let maximumUnits = 0;
  let maximumPublicUnits = 0;
  let maximumNativeUnits = 0;
  let maximumBehaviours = 0;
  let maximumPublicBehaviours = 0;
  let maximumLocalBehaviours = 0;
  let invalidBehaviourOwners = 0;
  const publicUnitKinds = new Set();
  const publicBehaviourKinds = new Set();
  const unsupportedEffects = new Set();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const left = safelyRender(baseline, frame);
    const right = safelyRender(generated, frame);
    if (left.errorCode) baselineRenderErrors += 1;
    if (right.errorCode) generatedRenderErrors += 1;
    maximumUnits = Math.max(maximumUnits, right.diagnostics.units);
    maximumPublicUnits = Math.max(maximumPublicUnits, right.diagnostics.publicUnits);
    maximumNativeUnits = Math.max(maximumNativeUnits, right.diagnostics.nativeUnits);
    maximumBehaviours = Math.max(maximumBehaviours, right.diagnostics.behaviours);
    maximumPublicBehaviours = Math.max(maximumPublicBehaviours, right.diagnostics.publicBehaviours);
    maximumLocalBehaviours = Math.max(maximumLocalBehaviours, right.diagnostics.localBehaviours);
    invalidBehaviourOwners = Math.max(invalidBehaviourOwners, right.diagnostics.invalidBehaviourOwners);
    left.diagnostics.unsupportedEffects.forEach((effect) => unsupportedEffects.add(effect));
    right.diagnostics.unsupportedEffects.forEach((effect) => unsupportedEffects.add(effect));
    right.diagnostics.publicUnitKinds.forEach((kind) => publicUnitKinds.add(kind));
    right.diagnostics.publicBehaviourKinds.forEach((kind) => publicBehaviourKinds.add(kind));
    if (!left.errorCode && !right.errorCode && left.snapshot === right.snapshot) matchedFrames += 1;
    else if (!firstMismatch) firstMismatch = {
      frame,
      treeMatches: !left.errorCode && !right.errorCode && left.snapshot === right.snapshot,
      ...(left.errorCode ? { baselineError: left.errorCode } : {}),
      ...(left.diagnosticCode ? { baselineDiagnostic: left.diagnosticCode } : {}),
      ...(right.errorCode ? { generatedError: right.errorCode } : {}),
      ...(right.diagnosticCode ? { generatedDiagnostic: right.diagnosticCode } : {}),
    };
  }
  if (firstMismatch && !firstMismatch.baselineError
      && firstMismatch.generatedDiagnostic === 'MissingGlobal:unlisted') {
    firstMismatch.generatedDiagnostic = 'GeneratedProgram:MissingBinding';
  }
  const unsupported = [...unsupportedEffects].sort();
  const mismatchCategory = firstMismatch
    ? firstMismatch.generatedDiagnostic === 'GeneratedProgram:MissingBinding'
      ? 'GeneratedProgramError'
      : firstMismatch.baselineError || firstMismatch.generatedError ? 'RenderError' : 'TreeMismatch'
    : unsupported.length > 0 ? 'UnsupportedEffects' : null;
  return {
    totalFrames, matchedFrames, exact: matchedFrames === totalFrames && unsupported.length === 0, firstMismatch,
    baselineRenderErrors, generatedRenderErrors, maximumUnits, maximumBehaviours,
    maximumPublicUnits, maximumNativeUnits, publicUnitKinds: [...publicUnitKinds].sort(),
    maximumPublicBehaviours, maximumLocalBehaviours,
    publicBehaviourKinds: [...publicBehaviourKinds].sort(),
    sourceDependentVisualComputations: Number(
      compilation.escapeHatches?.sourceDependentVisualComputations ?? 0,
    ),
    invalidBehaviourOwners, unsupportedEffects: unsupported, mismatchCategory,
  };
}

function createEvaluator(kind, compilation, video, props) {
  const state = { frame: 0 };
  const unsupportedEffects = new Set();
  const React = createFakeReact(unsupportedEffects);
  const context = vm.createContext(createGlobals(state, video, React, kind, unsupportedEffects), {
    name: `cba-v2-${kind}`,
    codeGeneration: { strings: false, wasm: false },
  });
  const source = compilation?.evaluationPrograms?.[kind];
  if (typeof source !== 'string') throw new TypeError('Missing verifier program');
  new vm.Script(source, { filename: `${kind}.cba-v2.js` }).runInContext(context, { timeout: 1000 });
  if (typeof context.__composition !== 'function') throw new TypeError('Verifier entry was not published');
  const staticRenderer = kind === 'cba' ? createStaticRenderer(compilation.rendering) : null;
  const renderOptions = kind === 'cba'
    ? { components: compilation.rendering?.components ?? {} }
    : {};
  return {
    render(frame) {
      state.frame = frame;
      const frameContext = {
        frame,
        fps: video.fps,
        width: video.width,
        height: video.height,
        durationInFrames: Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps)),
      };
      const value = context.__composition(props, frameContext);
      const diagnostics = kind === 'cba' ? inspectGraph(value) : emptyDiagnostics();
      diagnostics.unsupportedEffects = [...unsupportedEffects].sort();
      const rendered = kind === 'cba'
        ? renderNativeTree(value, React, frameContext, staticRenderer, renderOptions)
        : value;
      return { snapshot: stableSnapshot(resolveTree(rendered, React, frameContext)), diagnostics };
    },
  };
}

function createStaticRenderer(rendering) {
  const adapters = (rendering?.adapters ?? []).map(({ adapter }) => {
    const render = UNIT_ADAPTERS[adapter];
    if (typeof render !== 'function') throw new TypeError('Unknown static verifier adapter');
    return render;
  });
  if (adapters.length === 0) return null;
  return (context) => {
    for (const render of adapters) {
      const output = render(context);
      if (output !== context.unhandled) return output;
    }
    return context.unhandled;
  };
}

function createGlobals(state, video, React, kind, unsupportedEffects) {
  const markEffect = (effect) => { unsupportedEffects.add(effect); };
  const target = {
    Array, Boolean, JSON, Math, Number, Object, String,
    ArrayBuffer, DataView,
    Float32Array, Float64Array,
    Int8Array, Int16Array, Int32Array,
    Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array,
    React,
    Fragment: React.Fragment,
    NATIVE_FRAGMENT,
    NativeUnit,
    plainVisualValue,
    readElementProp,
    Behaviour,
    Computed,
    ContextValue,
    Interpolation,
    RecordValue,
    Tween,
    Opacity,
    Scale,
    Translate,
    Rotate,
    readStyleValue,
    readTransformSignal,
    renderNativeTree,
    stripVisualStyle,
    tweenOptions,
    unitsOption,
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({
      fps: video.fps,
      width: video.width,
      height: video.height,
      durationInFrames: Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps)),
    }),
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useRef: (initial = null) => ({ current: initial }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    interpolate,
    spring: ({ frame = state.frame, fps = video.fps } = {}) => springValue(frame, fps),
    Easing: createEasing(),
    loadGoogleFont: createFontLoader,
    loadFont: createFontLoader,
    document: createDocumentStub(markEffect),
    Image: createImageClass(markEffect),
    Path2D: createPath2DClass(markEffect),
    THREE: createThreeStub(markEffect),
    devicePixelRatio: 1,
    performance: Object.freeze({ now: () => state.frame / Math.max(1, video.fps) * 1000 }),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    console: Object.freeze({ log() {}, warn() {}, error() {} }),
  };
  const remotionComponents = [
    'AbsoluteFill', 'Sequence', 'Series', 'Img', 'Video', 'OffthreadVideo', 'Audio', 'AnimatedImage',
  ];
  for (const name of remotionComponents) target[name] = externalComponent(name, React);
  const threeComponents = [
    'ThreeCanvas', 'Text', 'Text3D', 'Center', 'Sparkles', 'Float', 'Stars', 'Cloud', 'Environment',
    'PerspectiveCamera', 'OrthographicCamera',
  ];
  for (const name of threeComponents) target[name] = externalComponent(name, React, () => markEffect('three'));
  for (const [name, Concrete] of Object.entries(UNIT_CLASSES)) target[`__v2${name}Unit`] = Concrete;
  target.globalThis = target;
  target.global = target;
  target.self = target;
  target.window = target;
  target.__cbaV2Kind = kind;
  return target;
}

function createFakeReact(unsupportedEffects) {
  const Fragment = Symbol.for('@cut3/cba-v2-test-fragment');
  return Object.freeze({
    Fragment,
    useMemo: (factory) => factory(),
    useCallback: (callback) => callback,
    useRef: (initial = null) => ({ current: initial }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => undefined,
    useLayoutEffect: () => undefined,
    createElement(type, props, ...children) {
      if (type === 'canvas') unsupportedEffects.add('canvas2d');
      if (typeof type === 'string' && THREE_ELEMENT_TYPES.has(type)) unsupportedEffects.add('three');
      const nextProps = { ...(props ?? {}) };
      if (children.length === 1) nextProps.children = children[0];
      else if (children.length > 1) nextProps.children = children;
      return { $$cbaV2Element: true, type, props: nextProps };
    },
  });
}

function externalComponent(name, React, onRender = null) {
  const component = (props = {}) => {
    onRender?.();
    return React.createElement(name, props, props.children);
  };
  Object.defineProperty(component, 'displayName', { value: name });
  return component;
}

function resolveTree(value, React, context) {
  if (isUnit(value)) throw new TypeError('Verifier received an unrendered Unit');
  if (Array.isArray(value)) return value.flatMap((nested) => {
    const resolved = resolveTree(nested, React, context);
    return (Array.isArray(resolved) ? resolved : [resolved])
      .filter((child) => child !== null && child !== undefined && typeof child !== 'boolean');
  });
  if (!value || typeof value !== 'object' || !value.$$cbaV2Element) return value;
  if (value.type === React.Fragment) return resolveTree(value.props.children ?? [], React, context);
  if (typeof value.type === 'function') return resolveTree(value.type(value.props), React, context);
  const { children, ...props } = value.props;
  const resolvedChildren = resolveTree(children ?? [], React, context);
  return {
    type: String(value.type),
    props: normaliseProps(props),
    children: Array.isArray(resolvedChildren) ? resolvedChildren : [resolvedChildren],
  };
}

function normaliseProps(props) {
  const output = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || key === 'key') continue;
    if (key === 'style' && value && typeof value === 'object') {
      output.style = { ...value };
      if (typeof value.transform === 'string') output.style.transform = canonicalTransform(value.transform);
    } else if (typeof value === 'function') output[key] = '[Function]';
    else if (key === 'ref') output[key] = '[Ref]';
    else output[key] = value;
  }
  return output;
}

function canonicalTransform(transform) {
  return scanTransform(transform).map(({ name, body }) => {
    const values = splitArguments(body).map((value) => value.trim());
    if (name === 'translateX') return `translate(${values[0]},0px)`;
    if (name === 'translateY') return `translate(0px,${values[0]})`;
    if (name === 'translate') return `translate(${values[0]},${values[1] ?? '0px'})`;
    return `${name}(${values.join(',')})`;
  }).join(' ');
}

function scanTransform(expression) {
  const output = [];
  let cursor = 0;
  while (cursor < expression.length) {
    const matcher = /([A-Za-z][\w-]*)\s*\(/g;
    matcher.lastIndex = cursor;
    const match = matcher.exec(expression);
    if (!match) break;
    let depth = 1;
    let end = matcher.lastIndex;
    while (end < expression.length && depth > 0) {
      if (expression[end] === '(') depth += 1;
      else if (expression[end] === ')') depth -= 1;
      end += 1;
    }
    if (depth !== 0) return [];
    output.push({ name: match[1], body: expression.slice(matcher.lastIndex, end - 1) });
    cursor = end;
  }
  return output;
}
function splitArguments(value) { return value.split(/\s*,\s*|\s+/).filter(Boolean); }

function inspectGraph(root) {
  const seen = new Set();
  let units = 0;
  let publicUnits = 0;
  let nativeUnits = 0;
  let behaviours = 0;
  let publicBehaviours = 0;
  let localBehaviours = 0;
  let invalidBehaviourOwners = 0;
  const publicUnitKinds = new Set();
  const publicBehaviourKinds = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!isUnit(value) || seen.has(value)) return;
    seen.add(value);
    units += 1;
    if (value instanceof NativeUnit) nativeUnits += 1;
    else {
      publicUnits += 1;
      publicUnitKinds.add(value.constructor.kind);
    }
    behaviours += value.behaviours.length;
    for (const behaviour of value.behaviours) {
      const kind = behaviour.constructor.kind;
      if (typeof kind === 'string' && kind.startsWith('behaviour.local.')) localBehaviours += 1;
      else {
        publicBehaviours += 1;
        if (typeof kind === 'string') publicBehaviourKinds.add(kind);
      }
    }
    invalidBehaviourOwners += value.behaviours.filter((behaviour) => behaviour.unit !== value).length;
    if (value instanceof NativeUnit) value.content.forEach(walk);
    else value.children.forEach(walk);
  };
  walk(root);
  return {
    units, publicUnits, nativeUnits, behaviours, publicBehaviours, localBehaviours,
    invalidBehaviourOwners,
    publicUnitKinds: [...publicUnitKinds].sort(),
    publicBehaviourKinds: [...publicBehaviourKinds].sort(),
  };
}

function safelyRender(evaluator, frame) {
  try { return evaluator.render(frame); }
  catch (error) {
    return {
      snapshot: null,
      diagnostics: emptyDiagnostics(),
      errorCode: error?.name ?? 'RenderError',
      diagnosticCode: safeDiagnosticCode(error),
    };
  }
}
function failed(totalFrames, code, error) {
  return {
    totalFrames, matchedFrames: 0, exact: false,
    firstMismatch: { frame: 0, treeMatches: false, evaluatorError: `${code}:${error?.name ?? 'Error'}` },
    baselineRenderErrors: totalFrames, generatedRenderErrors: totalFrames,
    maximumUnits: 0, maximumPublicUnits: 0, maximumNativeUnits: 0,
    maximumBehaviours: 0, maximumPublicBehaviours: 0, maximumLocalBehaviours: 0,
    publicUnitKinds: [], publicBehaviourKinds: [], sourceDependentVisualComputations: 0,
    invalidBehaviourOwners: 0,
    unsupportedEffects: [], mismatchCategory: code,
  };
}
function emptyDiagnostics() {
  return {
    units: 0, publicUnits: 0, nativeUnits: 0, behaviours: 0,
    publicBehaviours: 0, localBehaviours: 0,
    publicUnitKinds: [], publicBehaviourKinds: [],
    invalidBehaviourOwners: 0, unsupportedEffects: [],
  };
}
function stableSnapshot(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function interpolate(value, input, output, options = {}) {
  if (!Array.isArray(input) || !Array.isArray(output) || input.length !== output.length || input.length < 2) {
    throw new TypeError('interpolate requires matching input and output ranges');
  }
  let index;
  if (value <= input[0]) index = 1;
  else if (value >= input.at(-1)) index = input.length - 1;
  else index = input.findIndex((point) => point >= value);
  const left = input[index - 1];
  const right = input[index];
  let progress = right === left ? 1 : (value - left) / (right - left);
  if (options.extrapolateLeft === 'clamp' || options.extrapolateRight === 'clamp') {
    progress = Math.max(0, Math.min(1, progress));
  }
  if (typeof options.easing === 'function') progress = options.easing(progress);
  return output[index - 1] + (output[index] - output[index - 1]) * progress;
}
function springValue(frame, fps) {
  const seconds = Math.max(0, frame) / Math.max(1, fps);
  return 1 - Math.exp(-8 * seconds) * Math.cos(10 * seconds);
}

const SAFE_DIAGNOSTIC_IDENTIFIERS = new Set([
  'AbsoluteFill', 'AnimatedImage', 'Audio', 'Computed', 'ContextValue', 'Easing', 'Image', 'Img',
  'Interpolation', 'OffthreadVideo', 'Path2D', 'RecordValue',
  'React', 'Sequence', 'Series', 'THREE', 'Text', 'ThreeCanvas', 'Video', 'document', 'interpolate',
  'loadFont', 'loadGoogleFont', 'spring', 'useCallback', 'useCurrentFrame', 'useEffect', 'useLayoutEffect',
  'useMemo', 'useRef', 'useState', 'useVideoConfig',
]);
const SAFE_DIAGNOSTIC_PROPERTIES = new Set([
  'absarc', 'addColorStop', 'addPath', 'arc', 'beginPath', 'bezierCurveTo', 'clearRect', 'closePath',
  'computeVertexNormals', 'createImageData', 'createLinearGradient', 'createRadialGradient', 'drawImage',
  'fill', 'fillRect', 'fillText', 'getAttribute', 'getContext', 'getImageData', 'lineTo', 'measureText',
  'moveTo', 'putImageData', 'quadraticCurveTo', 'rect', 'resetTransform', 'restore', 'rotate', 'save',
  'scale', 'setAttribute', 'setFromPoints', 'setIndex', 'setLineDash', 'setTransform', 'stroke',
  'strokeRect', 'strokeText', 'toDataURL', 'translate',
]);

function safeDiagnosticCode(error) {
  const message = String(error?.message ?? '');
  if (error?.name === 'ReferenceError') {
    const identifier = message.match(/^([A-Za-z_$][\w$]*) is not defined$/)?.[1];
    return identifier && SAFE_DIAGNOSTIC_IDENTIFIERS.has(identifier)
      ? `MissingGlobal:${identifier}`
      : 'MissingGlobal:unlisted';
  }
  if (error?.name === 'TypeError') {
    if (message === 'Unit public state must contain only plain serializable data') {
      return 'DomainContract:NonSerializableUnitState';
    }
    if (message.startsWith('Unit already has Behaviour')) return 'TypeError:DuplicateBehaviour';
    if (message === 'A Unit can only have one parent') return 'TypeError:UnitParentConflict';
    if (message === 'A Behaviour can only be added to its constructor Unit') return 'TypeError:BehaviourOwner';
    const property = message.match(/reading ['"]([A-Za-z_$][\w$]*)['"]/)?.[1];
    if (property && (SAFE_DIAGNOSTIC_IDENTIFIERS.has(property) || SAFE_DIAGNOSTIC_PROPERTIES.has(property))) {
      return `MissingProperty:${property}`;
    }
    const method = message.match(/\.([A-Za-z_$][\w$]*) is not a function/)?.[1];
    if (method && SAFE_DIAGNOSTIC_PROPERTIES.has(method)) return `MissingMethod:${method}`;
    if (/not iterable/.test(message)) return 'TypeError:NotIterable';
    if (/circular structure/i.test(message)) return 'TypeError:SerializationCycle';
    if (/is not a constructor/.test(message)) return 'TypeError:NotConstructor';
    if (/is not a function/.test(message)) return 'TypeError:NotFunction';
    if (/Cannot read propert/.test(message)) return 'TypeError:MissingProperty';
    if (/Cannot set propert/.test(message)) return 'TypeError:WriteProperty';
    if (/Cannot convert/.test(message)) return 'TypeError:Conversion';
    return 'TypeError';
  }
  return error?.name ?? 'RenderError';
}

const THREE_ELEMENT_TYPES = new Set([
  'group', 'mesh', 'points', 'lineSegments', 'ambientLight', 'directionalLight', 'pointLight',
  'spotLight', 'meshBasicMaterial', 'meshStandardMaterial', 'pointsMaterial',
]);

function createEasing() {
  const linear = (value) => value;
  const quad = (value) => value * value;
  const cubic = (value) => value * value * value;
  const poly = (power) => (value) => value ** power;
  const sin = (value) => 1 - Math.cos(value * Math.PI / 2);
  const circle = (value) => 1 - Math.sqrt(Math.max(0, 1 - value * value));
  const exp = (value) => value === 0 ? 0 : 2 ** (10 * (value - 1));
  const elastic = (bounciness = 1) => (value) => (
    1 - Math.cos(value * Math.PI / 2) ** 3 * Math.cos(value * Math.PI * bounciness)
  );
  const back = (overshoot = 1.70158) => (value) => value * value * ((overshoot + 1) * value - overshoot);
  const bounce = (value) => {
    if (value < 1 / 2.75) return 7.5625 * value * value;
    if (value < 2 / 2.75) { const x = value - 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
    if (value < 2.5 / 2.75) { const x = value - 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
    const x = value - 2.625 / 2.75;
    return 7.5625 * x * x + 0.984375;
  };
  const inside = (easing) => (value) => easing(value);
  const out = (easing) => (value) => 1 - easing(1 - value);
  const inOut = (easing) => (value) => value < 0.5
    ? easing(value * 2) / 2
    : 1 - easing((1 - value) * 2) / 2;
  return Object.freeze({
    linear, ease: cubicBezier(0.42, 0, 1, 1), quad, cubic, poly, sin, circle, exp, elastic,
    back, bounce, bezier: cubicBezier, in: inside, out, inOut,
  });
}

function cubicBezier(x1, y1, x2, y2) {
  const sample = (a, b, value) => 3 * a * (1 - value) ** 2 * value
    + 3 * b * (1 - value) * value ** 2 + value ** 3;
  return (value) => {
    if (value <= 0 || value >= 1) return value;
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 16; iteration += 1) {
      const middle = (low + high) / 2;
      if (sample(x1, x2, middle) < value) low = middle;
      else high = middle;
    }
    return sample(y1, y2, (low + high) / 2);
  };
}

function createFontLoader() {
  return Object.freeze({ fontFamily: 'VerifierFont', waitUntilDone: () => Promise.resolve() });
}

function createDocumentStub(markEffect) {
  const fonts = Object.freeze({ add() {}, delete() { return false; }, has() { return false; }, ready: Promise.resolve() });
  return Object.freeze({
    fonts,
    createElement(type) {
      if (String(type).toLowerCase() !== 'canvas') throw new TypeError('UnsupportedDocumentElement');
      return new (createCanvasClass(markEffect))();
    },
  });
}

function createCanvasClass(markEffect) {
  const Context = createCanvasContextClass(markEffect);
  return class VerifierCanvas {
    constructor() { markEffect('canvas2d'); this.width = 300; this.height = 150; }
    getContext(type) {
      if (type !== '2d') return null;
      markEffect('canvas2d');
      return new Context(this);
    }
    toDataURL() { markEffect('canvas2d'); return 'data:image/png;base64,'; }
  };
}

function createCanvasContextClass(markEffect) {
  return class VerifierCanvasRenderingContext2D {
    constructor(canvas) { this.canvas = canvas; this.globalAlpha = 1; }
    save() { markEffect('canvas2d'); }
    restore() { markEffect('canvas2d'); }
    clearRect() { markEffect('canvas2d'); }
    fillRect() { markEffect('canvas2d'); }
    strokeRect() { markEffect('canvas2d'); }
    drawImage() { markEffect('canvas2d'); }
    fillText() { markEffect('canvas2d'); }
    strokeText() { markEffect('canvas2d'); }
    translate() { markEffect('canvas2d'); }
    rotate() { markEffect('canvas2d'); }
    scale() { markEffect('canvas2d'); }
    beginPath() { markEffect('canvas2d'); }
    closePath() { markEffect('canvas2d'); }
    moveTo() { markEffect('canvas2d'); }
    lineTo() { markEffect('canvas2d'); }
    arc() { markEffect('canvas2d'); }
    fill() { markEffect('canvas2d'); }
    stroke() { markEffect('canvas2d'); }
    clip() { markEffect('canvas2d'); }
    setTransform() { markEffect('canvas2d'); }
    resetTransform() { markEffect('canvas2d'); }
    measureText(value) { return { width: String(value ?? '').length * 10 }; }
    createLinearGradient() { markEffect('canvas2d'); return createGradientStub(); }
    createRadialGradient() { markEffect('canvas2d'); return createGradientStub(); }
    createImageData(width, height) {
      markEffect('canvas2d');
      return { width, height, data: new Uint8ClampedArray(Math.max(0, width * height * 4)) };
    }
    getImageData(_x, _y, width, height) { return this.createImageData(width, height); }
    putImageData() { markEffect('canvas2d'); }
  };
}

function createGradientStub() { return Object.freeze({ addColorStop() {} }); }

function createImageClass(markEffect) {
  return class VerifierImage {
    constructor() { markEffect('canvas2d'); this.width = 0; this.height = 0; this.complete = false; this.src = ''; }
  };
}

function createPath2DClass(markEffect) {
  return class VerifierPath2D {
    constructor() { markEffect('canvas2d'); }
    addPath() { markEffect('canvas2d'); }
    moveTo() { markEffect('canvas2d'); }
    lineTo() { markEffect('canvas2d'); }
    bezierCurveTo() { markEffect('canvas2d'); }
    quadraticCurveTo() { markEffect('canvas2d'); }
    arc() { markEffect('canvas2d'); }
    rect() { markEffect('canvas2d'); }
    closePath() { markEffect('canvas2d'); }
  };
}

function createThreeStub(markEffect) {
  class ThreeObject {
    constructor(...parameters) { markEffect('three'); this.parameters = parameters; }
    dispose() {}
  }
  class Path extends ThreeObject {
    constructor(...parameters) { super(...parameters); this.holes = []; }
    moveTo() { return this; }
    lineTo() { return this; }
    bezierCurveTo() { return this; }
    quadraticCurveTo() { return this; }
    absarc() { return this; }
    ellipse() { return this; }
    closePath() { return this; }
  }
  class Shape extends Path {}
  class BufferAttribute extends ThreeObject {
    constructor(array, itemSize, normalized = false) {
      super(); this.array = array; this.itemSize = itemSize; this.normalized = normalized;
      this.count = itemSize > 0 ? array.length / itemSize : 0;
    }
  }
  class Float32BufferAttribute extends BufferAttribute {
    constructor(array, itemSize, normalized = false) {
      super(array instanceof Float32Array ? array : new Float32Array(array), itemSize, normalized);
    }
  }
  class BufferGeometry extends ThreeObject {
    constructor(...parameters) { super(...parameters); this.attributes = {}; this.index = null; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; return this; }
    getAttribute(name) { return this.attributes[name]; }
    setIndex(index) { this.index = index; return this; }
    computeVertexNormals() { return this; }
    setFromPoints(points) { this.points = [...points]; return this; }
    center() { return this; }
    translate() { return this; }
    rotateX() { return this; }
    rotateY() { return this; }
    rotateZ() { return this; }
    scale() { return this; }
  }
  class Vector2 extends ThreeObject { constructor(x = 0, y = 0) { super(); this.x = x; this.y = y; } }
  class Vector3 extends ThreeObject { constructor(x = 0, y = 0, z = 0) { super(); this.x = x; this.y = y; this.z = z; } }
  class Color extends ThreeObject { constructor(value = 0xffffff) { super(); this.value = value; } }
  const geometry = (name) => class extends BufferGeometry {
    constructor(...parameters) { super(...parameters); this.type = name; }
  };
  class CanvasTexture extends ThreeObject {
    constructor(image) { super(); this.image = image; this.needsUpdate = false; }
  }
  class ShaderMaterial extends ThreeObject {
    constructor(options = {}) { super(); Object.assign(this, options); }
  }
  return Object.freeze({
    Path, Shape, BufferAttribute, Float32BufferAttribute, BufferGeometry,
    SphereGeometry: geometry('SphereGeometry'), ExtrudeGeometry: geometry('ExtrudeGeometry'),
    PlaneGeometry: geometry('PlaneGeometry'), BoxGeometry: geometry('BoxGeometry'),
    CircleGeometry: geometry('CircleGeometry'), CylinderGeometry: geometry('CylinderGeometry'),
    TorusGeometry: geometry('TorusGeometry'), CanvasTexture, ShaderMaterial, Vector2, Vector3, Color,
    DoubleSide: 2, FrontSide: 0, BackSide: 1, AdditiveBlending: 2,
    MathUtils: Object.freeze({
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      degToRad: (degrees) => degrees * Math.PI / 180,
      lerp: (from, to, progress) => from + (to - from) * progress,
    }),
  });
}
