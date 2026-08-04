import { Unit, isUnit } from '../../../core/Unit.js';

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

export function unitsOption(units) { return { units }; }
export function tweenOptions(from, to, start, end, easing = 'linear') {
  return { from, to, start, end, easing };
}

/** Render NativeUnit without a registry or runtime component identifier. */
export function renderNativeTree(value, React, context = {}) {
  if (Array.isArray(value)) return value.map((nested) => renderNativeTree(nested, React, context));
  if (!isUnit(value)) return value;
  if (!(value instanceof NativeUnit)) {
    throw new TypeError(`cba-v2 cannot render non-native Unit ${value.constructor.kind}`);
  }
  const patch = projectBehaviours(value, context);
  const props = { ...value.props };
  if (patch.style) props.style = materializeStyle(props.style, patch.style);
  for (const [key, nested] of Object.entries(patch)) if (key !== 'style') props[key] = nested;
  const children = value.content.map((child) => renderNativeTree(child, React, context));
  const type = value.type === NATIVE_FRAGMENT ? React.Fragment : value.type;
  if (typeof type === 'function') {
    const componentProps = { ...props };
    if (children.length === 1) componentProps.children = children[0];
    else if (children.length > 1) componentProps.children = children;
    return renderNativeTree(type(componentProps), React, context);
  }
  return React.createElement(type, props, ...children);
}

function projectBehaviours(unit, context) {
  let output = {};
  for (const behaviour of unit.behaviours) {
    const patch = behaviour.onFrame(context);
    if (patch && typeof patch === 'object') output = merge(output, patch);
  }
  if (unit.opacity !== undefined) output = merge(output, { style: { opacity: unit.opacity } });
  if (unit.transform !== undefined) output = merge(output, { style: { transform: unit.transform } });
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

function merge(left, right) {
  const output = { ...left };
  for (const [key, value] of Object.entries(right)) {
    output[key] = isRecord(output[key]) && isRecord(value) ? merge(output[key], value) : value;
  }
  return output;
}
function isRecord(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
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
