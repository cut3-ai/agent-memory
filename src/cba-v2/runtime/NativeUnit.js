import { Unit, isUnit } from '../../../core/Unit.js';
import { projectUnit } from '../../../core/frame.js';

export const NATIVE_FRAGMENT = Symbol.for('@cut3/agent-memory.cba-v2.fragment');
const TRANSFORM_PLAN = Symbol('cba-v2.transform-plan');

/** Lossless boundary for elements which do not yet have a public Unit class. */
export class NativeUnit extends Unit {
  static kind = 'unit.internal.native';

  constructor(type, props = null, ...content) {
    super();
    for (const unit of collectUnits(content)) this.addUnit(unit);
    // The lossless evaluator boundary may retain component functions and child
    // Unit references. Keep those implementation details outside the public,
    // serializable Unit state inspected by the domain engine.
    Object.defineProperties(this, {
      type: { value: type, enumerable: false, writable: false },
      props: { value: props ?? {}, enumerable: false, writable: false },
      content: { value: content, enumerable: false, writable: false },
    });
  }
}

export function stripVisualStyle(props, keys, promotedTransformIndexes = null) {
  if (!props || typeof props !== 'object') return props ?? {};
  const output = { ...props };
  if (!output.style || typeof output.style !== 'object') return output;
  output.style = { ...output.style };
  const partialTransform = Array.isArray(promotedTransformIndexes)
    && keys.includes('transform');
  if (partialTransform) {
    const operations = scanTransform(String(output.style.transform ?? ''));
    const promoted = new Set(promotedTransformIndexes);
    if (operations.length > 0
        && [...promoted].every((index) => Number.isInteger(index) && operations[index])) {
      Object.defineProperty(output.style, TRANSFORM_PLAN, {
        value: operations.map((operation, index) => promoted.has(index)
          ? { kind: transformKind(operation.name) }
          : { raw: operation.raw }),
      });
    }
  }
  keys.forEach((key) => {
    if (key !== 'transform' || !partialTransform || output.style[TRANSFORM_PLAN]) {
      delete output.style[key];
    }
  });
  return output;
}

export function readStyleValue(props, key) { return props?.style?.[key]; }
export function readElementProp(props, key) { return plainVisualValue(props?.[key]); }
export function plainVisualValue(value) {
  if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(plainVisualValue);
  if (Object.prototype.toString.call(value) === '[object Object]') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, plainVisualValue(nested)]));
  }
  return value;
}

export function readTransformOperation(transform, index) {
  const operation = scanTransform(String(transform ?? ''))[index];
  if (!operation) return undefined;
  const values = splitArguments(operation.body).map(parseCssNumber);
  if (operation.name === 'scale') return { value: values[0]?.value ?? 1, syntax: 'scale' };
  if (operation.name === 'rotate') {
    return { value: values[0]?.value ?? 0, unit: values[0]?.unit ?? 'deg', syntax: 'rotate' };
  }
  if (operation.name === 'translateX') {
    return { x: values[0]?.value ?? 0, y: 0, unit: values[0]?.unit ?? 'px', syntax: 'translateX' };
  }
  if (operation.name === 'translateY') {
    return { x: 0, y: values[0]?.value ?? 0, unit: values[0]?.unit ?? 'px', syntax: 'translateY' };
  }
  return {
    x: values[0]?.value ?? 0,
    y: values[1]?.value ?? 0,
    unit: values[0]?.unit ?? values[1]?.unit ?? 'px',
    syntax: 'translate',
  };
}

export function readTransformSignal(transform, index, kind) {
  const operation = readTransformOperation(transform, index);
  if (kind === 'translate') {
    return operation ? { x: operation.x ?? 0, y: operation.y ?? 0,
      ...(operation.z === undefined ? {} : { z: operation.z }) } : undefined;
  }
  return operation?.value;
}

export function unitsOption(unit) { return { unit }; }
export function tweenOptions(from, to, start, end, easing = 'linear') {
  return { from, to, start, end, easing };
}

/**
 * Render a mixed public/Native graph. Public dispatch is ordinary statically
 * imported application code supplied by the emitter; this boundary owns no
 * class registry and imports no concrete public Unit.
 */
export function renderNativeTree(value, React, context = {}, renderUnit = null, options = {}) {
  if (Array.isArray(value)) {
    return value.map((nested) => renderNativeTree(nested, React, context, renderUnit, options));
  }
  if (!isUnit(value)) return value;
  if (value instanceof NativeUnit) {
    const patch = projectUnit(value, context);
    const props = { ...value.props };
    const visualPatch = {
      ...(patch.style ?? {}),
      ...(patch.opacity === undefined ? {} : { opacity: patch.opacity }),
      ...(patch.transform === undefined ? {} : { transform: patch.transform }),
    };
    if (Object.keys(visualPatch).length > 0) props.style = materializeStyle(props.style, visualPatch);
    for (const [key, nested] of Object.entries(patch)) {
      if (!['opacity', 'style', 'transform'].includes(key)) props[key] = nested;
    }
    const children = value.content.map((child) => (
      renderNativeTree(child, React, context, renderUnit, options)
    ));
    const type = value.type === NATIVE_FRAGMENT ? React.Fragment : value.type;
    if (typeof type === 'function') {
      const componentProps = { ...props };
      if (children.length === 1) componentProps.children = children[0];
      else if (children.length > 1) componentProps.children = children;
      return renderNativeTree(type(componentProps), React, context, renderUnit, options);
    }
    return React.createElement(type, props, ...children);
  }

  if (typeof renderUnit !== 'function') {
    throw new TypeError(`cba-v2 requires a static adapter for ${value.constructor.name}`);
  }
  const state = projectUnit(value, context);
  if (state.visible === false) return null;
  const unhandled = Symbol.for('@cut3/agent-memory.cba-v2.unhandled-unit');
  const components = options.components ?? {};
  const adapterContext = Object.freeze({
    React,
    component(name, fallback) { return components[name] ?? fallback; },
    frame: context,
    props(name, props) {
      if (typeof options.adaptProps !== 'function') return props;
      const adapted = options.adaptProps(Object.freeze({
        frame: context, name, props, state, unit: value,
      }));
      if (!isRecord(adapted)) throw new TypeError('backend prop adapter must return a plain object');
      return adapted;
    },
    render(child, nextContext = context) {
      return renderNativeTree(child, React, nextContext, renderUnit, options);
    },
    renderChildren(nextContext = context) {
      return value.children.map((child) => (
        renderNativeTree(child, React, nextContext, renderUnit, options)
      )).filter(renderedChild);
    },
    renderSequence: typeof options.renderSequence === 'function'
      ? (children) => options.renderSequence(Object.freeze({
        children, frame: context, state, unit: value,
      }))
      : null,
    state,
    unit: value,
    unhandled,
  });
  const output = renderUnit(adapterContext);
  if (output === unhandled) {
    throw new TypeError(`No static cba-v2 adapter for ${value.constructor.name}`);
  }
  return output;
}

function materializeStyle(base = {}, patch = {}) {
  const style = { ...(base ?? {}), ...patch };
  if (!patch.transform || typeof patch.transform !== 'object') return style;
  const plan = base?.[TRANSFORM_PLAN];
  if (Array.isArray(plan)) {
    style.transform = plan.map((entry) => entry.raw ?? formatTransform(
      entry.kind,
      patch.transform[entry.kind],
    )).join(' ');
    return style;
  }
  const transforms = [];
  if (typeof base?.transform === 'string' && base.transform) transforms.push(base.transform);
  for (const [kind, value] of Object.entries(patch.transform)) {
    transforms.push(formatTransform(kind, value));
  }
  style.transform = transforms.join(' ');
  return style;
}

function formatTransform(kind, value) {
  if (kind === 'scale') return `scale(${formatNumber(value)})`;
  if (kind === 'rotate') {
    return `${value?.syntax ?? 'rotate'}(${formatNumber(value?.value)}${value?.units ?? value?.unit ?? 'deg'})`;
  }
  const unit = value?.units ?? value?.unit ?? 'px';
  if (value?.syntax === 'translateX') return `translateX(${formatNumber(value.x)}${unit})`;
  if (value?.syntax === 'translateY') return `translateY(${formatNumber(value.y)}${unit})`;
  return `translate(${formatNumber(value?.x)}${unit}, ${formatNumber(value?.y)}${unit})`;
}

function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function renderedChild(value) { return value !== null && value !== undefined && value !== false; }
function* collectUnits(values) {
  for (const value of values) {
    if (Array.isArray(value)) yield* collectUnits(value);
    else if (isUnit(value)) yield value;
  }
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
    output.push({
      name: match[1],
      body: expression.slice(matcher.lastIndex, end - 1),
      raw: expression.slice(match.index, end),
    });
    cursor = end;
  }
  return output;
}
function splitArguments(value) { return value.split(/\s*,\s*|\s+/).filter(Boolean); }
function parseCssNumber(value) {
  const match = String(value).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(.*)$/);
  return match ? { value: Number(match[1]), unit: match[2] } : { value: Number(value), unit: '' };
}
function formatNumber(value) { return Object.is(value, -0) ? '0' : String(value); }
function transformKind(name) {
  if (name === 'scale') return 'scale';
  if (name === 'rotate') return 'rotate';
  return 'translate';
}
