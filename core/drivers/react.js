import { projectUnit } from '../frame.js';
import { frameContext } from '../signals.js';
import { isUnit } from '../Unit.js';

export const UNHANDLED_UNIT = Symbol.for('@cut3/agent-memory.unhandled-unit');

/**
 * Renderer boundary for a statically assembled Unit renderer.
 *
 * `renderUnit` is ordinary application code which directly calls only the ESM
 * adapters that composition needs. This module intentionally imports no
 * concrete Unit class, owns no adapter collection, and performs no lookup.
 */
export function createReactDriver(React, renderUnit, options = {}) {
  if (typeof React?.createElement !== 'function') {
    throw new TypeError('React.createElement is required');
  }
  if (typeof renderUnit !== 'function') {
    throw new TypeError('React driver requires a statically imported Unit renderer');
  }

  const components = Object.freeze({ ...(options.components ?? {}) });

  const render = (unit, input = {}) => renderNode(unit, frameContext(input));

  const renderNode = (unit, frame) => {
    if (!isUnit(unit)) throw new TypeError('React driver can only render a Unit');
    const state = projectUnit(unit, frame);
    if (state.visible === false) return null;

    const adapterContext = Object.freeze({
      React,
      component(name, fallback) {
        return components[name] ?? fallback;
      },
      frame,
      props(name, value) {
        if (typeof options.adaptProps !== 'function') return value;
        const adapted = options.adaptProps(Object.freeze({
          frame,
          name,
          props: value,
          state,
          unit,
        }));
        if (!isPlainRecord(adapted)) {
          throw new TypeError('backend prop adapter must return a plain object');
        }
        return adapted;
      },
      render(child, nextFrame = frame) {
        return renderNode(child, frameContext(nextFrame));
      },
      renderChildren(nextFrame = frame) {
        const childFrame = frameContext(nextFrame);
        return unit.children
          .map((child) => renderNode(child, childFrame))
          .filter(renderedChild);
      },
      renderSequence: typeof options.renderSequence === 'function'
        ? (children) => options.renderSequence(Object.freeze({
          children,
          frame,
          state,
          unit,
        }))
        : null,
      state,
      unit,
      unhandled: UNHANDLED_UNIT,
    });

    const output = renderUnit(adapterContext);
    if (output === UNHANDLED_UNIT) {
      // Authentic memory Units are renderer-neutral semantic wrappers around
      // a concrete foundation subtree. They need no per-memory adapter.
      if (unit.children.length === 1) return renderNode(unit.children[0], frame);
      throw new TypeError(`No static React adapter for ${unit.constructor.name}`);
    }
    return output;
  };

  return Object.freeze({ name: options.name ?? 'react', render });
}

function renderedChild(value) {
  return value !== null && value !== undefined && value !== false;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
