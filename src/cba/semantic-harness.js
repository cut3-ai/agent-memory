import vm from 'node:vm';

import { createRuntime } from '../../core/runtime.js';
import { createReactDriver } from '../../core/drivers/react.js';
import { BEHAVIOUR_CATALOG, UNIT_CATALOG } from './catalog.js';

export function verifyAllFrames(compilation, video) {
  const baseline = createEvaluator('baseline', compilation, video);
  const generated = createEvaluator('cba', compilation, video);
  const totalFrames = Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps));
  let matchedFrames = 0;
  let effectTraceMismatches = 0;
  let canvasTraceMismatches = 0;
  let firstMismatch = null;
  let maximumOrphanBehaviours = 0;
  let maximumPendingBehaviours = 0;
  let fallbackBehaviours = 0;

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const left = baseline.render(frame);
    const right = generated.render(frame);
    maximumOrphanBehaviours = Math.max(maximumOrphanBehaviours, right.diagnostics.orphanBehaviours);
    maximumPendingBehaviours = Math.max(maximumPendingBehaviours, right.diagnostics.pendingBehaviours);
    fallbackBehaviours += right.diagnostics.fallbackBehaviours;
    const treeMatches = left.snapshot === right.snapshot;
    const effectsMatch = left.effectTrace === right.effectTrace;
    const canvasMatches = left.canvasTrace === right.canvasTrace;
    if (treeMatches && effectsMatch && canvasMatches) {
      matchedFrames += 1;
    } else {
      if (!effectsMatch) effectTraceMismatches += 1;
      if (!canvasMatches) canvasTraceMismatches += 1;
      firstMismatch ??= {
        frame,
        treeMatches,
        effectsMatch,
        canvasMatches,
      };
    }
  }

  baseline.dispose();
  generated.dispose();
  return {
    totalFrames,
    matchedFrames,
    exact: matchedFrames === totalFrames,
    effectTraceMismatches,
    canvasTraceMismatches,
    firstMismatch,
    maximumOrphanBehaviours,
    maximumPendingBehaviours,
    fallbackBehaviours,
  };
}

function createEvaluator(kind, compilation, video) {
  const state = {
    frame: 0,
    fps: video.fps,
    width: video.width,
    height: video.height,
    durationInFrames: Math.max(1, Math.ceil(video.lengthMs / 1000 * video.fps)),
    canvasTrace: [],
    effectTrace: [],
    randomState: 0x12345678,
  };
  const hooks = createHooks(state);
  const React = createFakeReact(hooks);
  const contextObject = createGlobals(state, hooks, React, compilation.evaluationPrograms.externalComponents);

  if (kind === 'baseline') {
    contextObject.__cba = {
      fragment: React.Fragment,
      unitRaw: (type, props, ...children) => React.createElement(type, props, ...children),
    };
  } else {
    contextObject.__cba = createRuntime({
      strict: true,
      driver: createReactDriver(React),
      unitFactories: createUnitFactories(),
      behaviourFactories: createBehaviourFactories(),
    });
  }

  const context = vm.createContext(contextObject, {
    name: `cba-${kind}`,
    codeGeneration: { strings: false, wasm: false },
  });
  const source = compilation.evaluationPrograms[kind];
  const script = new vm.Script(source, { filename: `${kind}.generated.js` });
  script.runInContext(context, { timeout: 1000 });
  if (typeof context.__composition !== 'function') {
    throw new Error(`${kind} evaluator did not expose a composition function`);
  }

  return {
    render(frame) {
      state.frame = frame;
      state.canvasTrace = [];
      state.effectTrace = [];
      hooks.beginRender();
      if (kind === 'cba') context.__cba.beginFrameDiagnostics();
      let tree = context.__composition();
      if (kind === 'cba') tree = context.__cba.render(tree);
      const resolved = resolveTree(tree, React, hooks, state, '0');
      hooks.flushEffects();
      return {
        snapshot: stableSnapshot(resolved),
        effectTrace: stableSnapshot(state.effectTrace),
        canvasTrace: stableSnapshot(state.canvasTrace),
        diagnostics: kind === 'cba'
          ? context.__cba.diagnostics()
          : { orphanBehaviours: 0, pendingBehaviours: 0, fallbackBehaviours: 0 },
      };
    },
    dispose() {
      hooks.dispose();
    },
  };
}

function createUnitFactories() {
  return new Map(Object.entries(UNIT_CATALOG).map(([id, definition]) => [id, {
    id,
    create(runtime, { type, props = {}, children = [] }) {
      return runtime.makeUnit(type, props, children, {
        factoryId: id,
        backend: definition.backend,
        componentKind: definition.componentKind,
      });
    },
  }]));
}

function createBehaviourFactories() {
  return new Map(Object.entries(BEHAVIOUR_CATALOG).map(([id, definition]) => [id, {
    id,
    create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
      return runtime.behaviour({
        id: instanceId,
        read,
        setup,
        ...descriptor,
        channel: definition.channel,
      });
    },
  }]));
}

function createHooks(state) {
  const slots = [];
  let cursor = 0;
  let scheduledEffects = [];

  const next = () => cursor++;
  const hooks = {
    beginRender() {
      cursor = 0;
      scheduledEffects = [];
    },
    useCurrentFrame: () => state.frame,
    useVideoConfig: () => ({
      fps: state.fps,
      width: state.width,
      height: state.height,
      durationInFrames: state.durationInFrames,
    }),
    useRef(initialValue = null) {
      const index = next();
      slots[index] ??= { current: initialValue };
      return slots[index];
    },
    useState(initialValue) {
      const index = next();
      if (!slots[index]) {
        slots[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      }
      return [slots[index].value, (nextValue) => {
        slots[index].value = typeof nextValue === 'function'
          ? nextValue(slots[index].value)
          : nextValue;
      }];
    },
    useMemo(factory, dependencies) {
      const index = next();
      if (!slots[index] || !sameDependencies(slots[index].dependencies, dependencies)) {
        slots[index] = { value: factory(), dependencies: cloneDependencies(dependencies) };
      }
      return slots[index].value;
    },
    useCallback(callback, dependencies) {
      return hooks.useMemo(() => callback, dependencies);
    },
    useEffect(setup, dependencies) {
      const index = next();
      const previous = slots[index];
      if (!previous || !sameDependencies(previous.dependencies, dependencies)) {
        scheduledEffects.push({ index, setup, dependencies: cloneDependencies(dependencies) });
      }
    },
    useLayoutEffect(setup, dependencies) {
      return hooks.useEffect(setup, dependencies);
    },
    flushEffects() {
      for (const pending of scheduledEffects) {
        const previous = slots[pending.index];
        if (typeof previous?.cleanup === 'function') previous.cleanup();
        state.effectTrace.push(['effect', pending.index]);
        const cleanup = pending.setup();
        slots[pending.index] = {
          dependencies: pending.dependencies,
          cleanup: typeof cleanup === 'function' ? cleanup : null,
        };
      }
      scheduledEffects = [];
    },
    dispose() {
      for (const slot of slots) if (typeof slot?.cleanup === 'function') slot.cleanup();
    },
  };
  return hooks;
}

function createFakeReact(hooks) {
  const Fragment = Symbol.for('@cut3/cba-test.fragment');
  return {
    Fragment,
    createElement(type, props, ...children) {
      return { __kind: 'element', type, props: props ?? {}, children };
    },
    memo: (component) => component,
    forwardRef: (render) => (props) => render(props, props.ref ?? null),
    createContext: (defaultValue) => ({
      _value: defaultValue,
      Provider: ({ value, children }) => children,
      Consumer: ({ children }) => children(defaultValue),
    }),
    useContext: (context) => context._value,
    cloneElement(element, props, ...children) {
      return {
        ...element,
        props: { ...element.props, ...props },
        children: children.length > 0 ? children : element.children,
      };
    },
    ...hooks,
  };
}

function createGlobals(state, hooks, React, externalComponents) {
  const math = Object.create(Math);
  math.random = () => {
    state.randomState = (1664525 * state.randomState + 1013904223) >>> 0;
    return state.randomState / 0x100000000;
  };
  const globals = {
    React,
    Math: math,
    console: { log() {}, warn() {}, error() {} },
    useCurrentFrame: hooks.useCurrentFrame,
    useVideoConfig: hooks.useVideoConfig,
    useRef: hooks.useRef,
    useState: hooks.useState,
    useMemo: hooks.useMemo,
    useCallback: hooks.useCallback,
    useEffect: hooks.useEffect,
    useLayoutEffect: hooks.useLayoutEffect,
    interpolate,
    interpolateColors: (_value, _input, output) => output[0],
    spring: ({ frame = state.frame, fps = state.fps, delay = 0 } = {}) => (
      Math.max(0, Math.min(1, (frame - delay) / Math.max(1, fps * 0.5)))
    ),
    Easing: createEasing(),
    loadGoogleFont: () => ({ fontFamily: 'CBA Test Font', waitUntilDone: async () => {} }),
    GOOGLE_FONTS: new Proxy({}, { get: (_target, property) => String(property) }),
    THREE: createThreeStub(),
    document: createDocumentStub(state),
    window: {},
    Image: class ImageStub { constructor() { this.src = ''; } },
    Path2D: class Path2DStub {},
    requestAnimationFrame: (callback) => {
      state.canvasTrace.push(['requestAnimationFrame', typeof callback]);
      return 1;
    },
    cancelAnimationFrame: (id) => state.canvasTrace.push(['cancelAnimationFrame', id]),
    performance: { now: () => state.frame / state.fps * 1000 },
    devicePixelRatio: 1,
  };

  for (const fullName of externalComponents) setComponentGlobal(globals, fullName);
  return new Proxy(globals, {
    has: () => true,
    get(target, property) {
      if (property === Symbol.unscopables) return undefined;
      if (property in target) return target[property];
      if (typeof property !== 'string') return undefined;
      const value = createUniversalStub(property);
      target[property] = value;
      return value;
    },
  });
}

function setComponentGlobal(globals, fullName) {
  const parts = fullName.split('.');
  if (parts.length === 1) {
    globals[parts[0]] ??= `@component/${fullName}`;
    return;
  }
  globals[parts[0]] ??= {};
  let current = globals[parts[0]];
  for (let index = 1; index < parts.length - 1; index += 1) {
    current[parts[index]] ??= {};
    current = current[parts[index]];
  }
  current[parts.at(-1)] = `@component/${fullName}`;
}

function resolveTree(value, React, hooks, state, path) {
  if (Array.isArray(value)) {
    return value.flatMap((nested, index) => {
      const resolved = resolveTree(nested, React, hooks, state, `${path}.${index}`);
      return Array.isArray(resolved) ? resolved : [resolved];
    });
  }
  if (!value || typeof value !== 'object' || value.__kind !== 'element') return value;
  if (value.type === React.Fragment) {
    return resolveTree(value.children, React, hooks, state, `${path}.f`);
  }
  if (typeof value.type === 'function') {
    const props = {
      ...value.props,
      children: packChildren(value.children),
    };
    return resolveTree(value.type(props), React, hooks, state, `${path}.c`);
  }

  const props = { ...value.props };
  if (props.ref) assignRef(props.ref, createHostNode(value.type, state));
  delete props.ref;
  delete props.key;
  return {
    type: normalizeType(value.type),
    props,
    children: resolveTree(value.children, React, hooks, state, `${path}.h`),
  };
}

function assignRef(ref, node) {
  if (typeof ref === 'function') ref(node);
  else if (ref && typeof ref === 'object') ref.current = node;
}

function createHostNode(type, state) {
  if (type === 'canvas') return createCanvasStub(state);
  return { __host: String(type) };
}

function createCanvasStub(state) {
  const canvas = { width: state.width, height: state.height };
  const context = createCanvasContext(state, canvas);
  canvas.getContext = (kind) => {
    state.canvasTrace.push(['getContext', kind]);
    return context;
  };
  return canvas;
}

function createCanvasContext(state, canvas) {
  const target = { canvas };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'measureText') return (text) => ({ width: String(text).length * 10 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return (...args) => {
          state.canvasTrace.push([String(property), ...args]);
          return { addColorStop: (...nested) => state.canvasTrace.push(['addColorStop', ...nested]) };
        };
      }
      if (property === 'getImageData') {
        return (...args) => {
          state.canvasTrace.push(['getImageData', ...args]);
          return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
        };
      }
      return (...args) => {
        state.canvasTrace.push([String(property), ...args.map(normalizeSnapshotValue)]);
        return undefined;
      };
    },
    set(object, property, value) {
      object[property] = value;
      state.canvasTrace.push([`set:${String(property)}`, normalizeSnapshotValue(value)]);
      return true;
    },
  });
}

function createDocumentStub(state) {
  return {
    createElement: (type) => type === 'canvas'
      ? createCanvasStub(state)
      : { style: {}, getContext: () => null },
  };
}

function createThreeStub() {
  const cache = new Map();
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'MathUtils') return { degToRad: (value) => value * Math.PI / 180 };
      if (!cache.has(property)) {
        cache.set(property, class ThreeValue {
          constructor(...args) { this.type = String(property); this.args = args; }
          set(...args) { this.args = args; return this; }
          clone() { return new this.constructor(...this.args); }
        });
      }
      return cache.get(property);
    },
  });
}

function createUniversalStub(name) {
  const callable = (...args) => ({ __stub: name, args });
  return new Proxy(callable, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) return () => 0;
      if (property === 'toString') return () => `[stub ${name}]`;
      return createUniversalStub(`${name}.${String(property)}`);
    },
    construct(_target, args) {
      return { __stub: name, args };
    },
  });
}

function createEasing() {
  const identity = (value) => value;
  return new Proxy({
    linear: identity,
    in: () => identity,
    out: () => identity,
    inOut: () => identity,
    bezier: () => identity,
  }, { get: (target, property) => target[property] ?? identity });
}

function interpolate(value, input, output, options = {}) {
  if (!Array.isArray(input) || !Array.isArray(output) || input.length < 2) return output?.[0] ?? value;
  let index = 0;
  while (index < input.length - 2 && value > input[index + 1]) index += 1;
  const left = input[index];
  const right = input[index + 1];
  let progress = right === left ? 0 : (value - left) / (right - left);
  if (options.extrapolateLeft === 'clamp' && value < input[0]) progress = 0;
  if (options.extrapolateRight === 'clamp' && value > input.at(-1)) progress = 1;
  if (typeof options.easing === 'function') progress = options.easing(progress);
  const from = output[index];
  const to = output[index + 1];
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * progress;
  return progress < 0.5 ? from : to;
}

function stableSnapshot(value) {
  return JSON.stringify(normalizeSnapshotValue(value));
}

function normalizeSnapshotValue(value, seen = new WeakSet()) {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { __number: 'NaN' };
    if (value === Infinity) return { __number: 'Infinity' };
    if (value === -Infinity) return { __number: '-Infinity' };
    if (Object.is(value, -0)) return { __number: '-0' };
    return value;
  }
  if (typeof value === 'function') return '[function]';
  if (typeof value === 'symbol') return `[symbol:${value.description ?? ''}]`;
  if (value === undefined) return '[undefined]';
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((nested) => normalizeSnapshotValue(nested, seen));
  if (ArrayBuffer.isView(value)) return Array.from(value, (nested) => normalizeSnapshotValue(nested, seen));
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'ref' || key === '_owner') continue;
    output[key] = normalizeSnapshotValue(value[key], seen);
  }
  return output;
}

function normalizeType(type) {
  if (typeof type === 'string') return type;
  if (typeof type === 'symbol') return `[symbol:${type.description ?? ''}]`;
  return `[type:${type?.displayName ?? type?.name ?? typeof type}]`;
}

function packChildren(children) {
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return children;
}

function sameDependencies(left, right) {
  if (left === undefined || right === undefined) return false;
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function cloneDependencies(value) {
  return Array.isArray(value) ? [...value] : value;
}
