import { CBA_FRAGMENT, isUnit } from '../Unit.js';

const bridgeCaches = new WeakMap();

export function createReactDriver(React, options = {}) {
  if (!React || typeof React.createElement !== 'function') {
    throw new TypeError('The React driver requires React.createElement');
  }

  const bridgeCache = bridgeCaches.get(React) ?? new WeakMap();
  bridgeCaches.set(React, bridgeCache);

  const render = (value) => {
    if (Array.isArray(value)) return value.map(render);
    if (value?.kind === 'behaviour' || value?.kind === 'behaviour-group') {
      return render(sample(value));
    }
    if (!isUnit(value)) return value;

    const props = materialize(value.props, render, sample);
    applyDetachedBehaviours(value, props, render, sample);
    const children = value.children.map(render);
    if (value.type === CBA_FRAGMENT) {
      return React.createElement(React.Fragment, props, ...children);
    }

    if (
      value.componentKind === 'local'
      && typeof value.type === 'function'
      && !value.type.prototype?.isReactComponent
    ) {
      const Bridge = getBridge(React, value.type, render, bridgeCache);
      return React.createElement(Bridge, props, ...children);
    }
    return React.createElement(value.type, props, ...children);
  };

  return { name: 'react', render };

  function sample(behaviour) {
    return behaviour.onFrame(options.getFrameContext?.() ?? {});
  }
}

function applyDetachedBehaviours(unit, props, render, sample) {
  const groupedTransforms = new Map();
  for (const behaviour of unit.behaviours) {
    if (storedAtPath(unit, behaviour.path)) continue;
    if (['scale', 'translate', 'rotate'].includes(behaviour.channel)) {
      const key = JSON.stringify(behaviour.path);
      const entry = groupedTransforms.get(key) ?? { path: behaviour.path, parts: [] };
      entry.parts.push(sample(behaviour));
      groupedTransforms.set(key, entry);
      continue;
    }
    setAtPath(props, behaviour.path, render(sample(behaviour)));
  }
  for (const { path, parts } of groupedTransforms.values()) {
    setAtPath(props, path, parts.filter(Boolean).join(' '));
  }
}

function storedAtPath(unit, path) {
  if (path[0] === 'children') return true;
  let current = unit.props;
  for (const key of path) {
    if (!current || typeof current !== 'object') return false;
    current = current[key];
  }
  return current?.kind === 'behaviour' || current?.kind === 'behaviour-group';
}

function setAtPath(root, path, value) {
  if (path.length === 0) return;
  let current = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    current[key] ??= {};
    current = current[key];
  }
  current[path.at(-1)] = value;
}

function getBridge(React, Component, render, cache) {
  if (cache.has(Component)) return cache.get(Component);
  const Bridge = (props) => render(Component(props));
  Bridge.displayName = `CbaBridge(${Component.displayName ?? Component.name ?? 'Component'})`;
  cache.set(Component, Bridge);
  return Bridge;
}

function materialize(value, render, sample, seen = new WeakMap()) {
  if (value?.kind === 'behaviour' || value?.kind === 'behaviour-group') {
    return render(sample(value));
  }
  if (Array.isArray(value)) return value.map((nested) => materialize(nested, render, sample, seen));
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return seen.get(value);
  const output = {};
  seen.set(value, output);
  for (const [key, nested] of Object.entries(value)) {
    output[key] = materialize(nested, render, sample, seen);
  }
  return output;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
