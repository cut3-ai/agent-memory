import {
  BehaviourGroup,
  LifecycleBehaviour,
  createBehaviour,
} from './Behaviour.js';
import { CBA_FRAGMENT, Unit } from './Unit.js';
import { createReactDriver } from './drivers/react.js';

export function createRuntime(options = {}) {
  const unitFactories = asFactoryMap(options.unitFactories);
  const behaviourFactories = asFactoryMap(options.behaviourFactories);
  let driver = options.driver ?? null;
  const strict = options.strict === true;
  const pendingBehaviours = [];
  const diagnosticState = createDiagnosticState();

  const runtime = {
    fragment: CBA_FRAGMENT,

    configure(next = {}) {
      addFactories(unitFactories, next.unitFactories);
      addFactories(behaviourFactories, next.behaviourFactories);
      if (next.driver) driver = next.driver;
      return runtime;
    },

    makeUnit(type, props, children = [], metadata = {}) {
      const unit = new Unit(type, props, [], metadata);
      diagnosticState.units.add(unit);
      attachNestedBehaviours(unit, props, []);
      unit.add(...children);
      return unit;
    },

    unit(type, props, ...children) {
      return runtime.makeUnit(type, props, children);
    },

    unitRaw(type, props, ...children) {
      return { type, props: props ?? {}, children };
    },

    template(id, type, props, ...children) {
      const factory = unitFactories.get(id);
      if (!factory) {
        if (strict) throw new Error(`Unresolved Unit factory: ${id}`);
        return runtime.makeUnit(type, props, children, { factoryId: id });
      }
      const unit = factory.create(runtime, { type, props: props ?? {}, children });
      if (unit?.kind !== 'unit') throw new TypeError(`Unit factory ${id} did not return a Unit`);
      diagnosticState.resolvedUnitFactories += 1;
      return unit;
    },

    element(id, _createElement, argumentsList) {
      if (!Array.isArray(argumentsList) || argumentsList.length === 0) {
        throw new TypeError('element() requires React.createElement arguments');
      }
      const [type, props, ...children] = argumentsList;
      return runtime.template(id, type, props, ...children);
    },

    repeat(id, read) {
      const value = read();
      const children = Array.isArray(value) ? value : [value];
      return runtime.template(id, CBA_FRAGMENT, null, ...children);
    },

    switch(id, read) {
      return runtime.template(id, CBA_FRAGMENT, null, read());
    },

    value(id, read, descriptor = {}) {
      const factory = behaviourFactories.get(id);
      if (factory) {
        const behaviour = factory.create(runtime, { id, read, descriptor });
        validateBehaviour(id, behaviour);
        diagnosticState.behaviours.add(behaviour);
        diagnosticState.resolvedBehaviourFactories += 1;
        return behaviour;
      }
      if (strict) throw new Error(`Unresolved Behaviour factory: ${id}`);
      const behaviour = createBehaviour({ id, read, ...descriptor });
      diagnosticState.behaviours.add(behaviour);
      diagnosticState.fallbackBehaviours += 1;
      return behaviour;
    },

    values(entries, read, descriptor = {}) {
      const behaviours = entries.map((entry) => {
        const factory = behaviourFactories.get(entry.id);
        if (!factory && strict) throw new Error(`Unresolved Behaviour factory: ${entry.id}`);
        const nestedDescriptor = { ...descriptor, ...entry };
        const behaviour = factory
          ? factory.create(runtime, { id: entry.id, read, descriptor: nestedDescriptor })
          : createBehaviour({ id: entry.id, read, ...nestedDescriptor });
        validateBehaviour(entry.id, behaviour);
        diagnosticState.behaviours.add(behaviour);
        if (factory) diagnosticState.resolvedBehaviourFactories += 1;
        else diagnosticState.fallbackBehaviours += 1;
        return behaviour;
      });
      return new BehaviourGroup(behaviours, read);
    },

    spread(id, read, descriptor = {}) {
      const values = read();
      if (!values || typeof values !== 'object') return values;
      const factory = behaviourFactories.get(id);
      if (!factory && strict) throw new Error(`Unresolved Behaviour factory: ${id}`);
      return Object.fromEntries(Object.entries(values).map(([key]) => {
        const behaviour = factory
          ? factory.create(runtime, {
            id: `${id}.${key}`,
            read: () => values[key],
            descriptor: {
              ...descriptor,
              channel: descriptor.channel ?? 'property',
              property: key,
            },
          })
          : runtime.value(`${id}.${key}`, () => values[key], {
            ...descriptor,
            channel: descriptor.channel ?? 'property',
            property: key,
          });
        validateBehaviour(id, behaviour);
        diagnosticState.behaviours.add(behaviour);
        if (factory) diagnosticState.resolvedBehaviourFactories += 1;
        return [key, behaviour];
      }));
    },

    object(entries, read, descriptor = {}) {
      const values = read();
      if (!values || typeof values !== 'object') return values;
      const output = { ...values };
      for (const entry of entries) {
        const factory = behaviourFactories.get(entry.id);
        if (!factory && strict) throw new Error(`Unresolved Behaviour factory: ${entry.id}`);
        const readProperty = () => values[entry.property];
        output[entry.property] = factory
          ? factory.create(runtime, {
            id: entry.id,
            read: readProperty,
            descriptor: { ...descriptor, ...entry },
          })
          : createBehaviour({ id: entry.id, read: readProperty, ...descriptor, ...entry });
        validateBehaviour(entry.id, output[entry.property]);
        diagnosticState.behaviours.add(output[entry.property]);
        if (factory) diagnosticState.resolvedBehaviourFactories += 1;
        else diagnosticState.fallbackBehaviours += 1;
      }
      return output;
    },

    effect(id, useEffectHook, hookArguments, descriptor = {}) {
      if (typeof useEffectHook !== 'function') {
        throw new TypeError('effect() requires the original useEffect hook');
      }
      if (!Array.isArray(hookArguments) || typeof hookArguments[0] !== 'function') {
        throw new TypeError('effect() requires the original hook argument list');
      }
      const [setup] = hookArguments;
      const factory = behaviourFactories.get(id);
      if (!factory && strict) throw new Error(`Unresolved Behaviour factory: ${id}`);
      const behaviour = factory
        ? factory.create(runtime, { id, setup, read: () => undefined, descriptor })
        : descriptor.channel === 'canvas-draw' || descriptor.channel === 'three-effect'
          ? createBehaviour({ id, setup, ...descriptor })
          : new LifecycleBehaviour({ id, setup, ...descriptor });
      validateBehaviour(id, behaviour);
      diagnosticState.behaviours.add(behaviour);
      if (factory) diagnosticState.resolvedBehaviourFactories += 1;
      else diagnosticState.fallbackBehaviours += 1;
      pendingBehaviours.push(behaviour);
      return useEffectHook(() => behaviour.onAdded(), ...hookArguments.slice(1));
    },

    behaviour(options) {
      return createBehaviour(options);
    },

    render(tree, renderOptions = {}) {
      const selected = renderOptions.driver ?? driver ?? inferReactDriver();
      return selected.render(runtime.finish(tree));
    },

    finish(tree) {
      attachPendingBehaviours(tree, pendingBehaviours);
      return tree;
    },

    beginFrameDiagnostics() {
      diagnosticState.units.clear();
      diagnosticState.behaviours.clear();
      diagnosticState.resolvedUnitFactories = 0;
      diagnosticState.resolvedBehaviourFactories = 0;
      diagnosticState.fallbackBehaviours = 0;
    },

    diagnostics() {
      const behaviours = [...diagnosticState.behaviours];
      return {
        units: diagnosticState.units.size,
        behaviours: behaviours.length,
        attachedBehaviours: behaviours.filter((behaviour) => behaviour.unit).length,
        orphanBehaviours: behaviours.filter((behaviour) => !behaviour.unit).length,
        pendingBehaviours: pendingBehaviours.length,
        resolvedUnitFactories: diagnosticState.resolvedUnitFactories,
        resolvedBehaviourFactories: diagnosticState.resolvedBehaviourFactories,
        fallbackBehaviours: diagnosticState.fallbackBehaviours,
      };
    },
  };

  return runtime;
}

function createDiagnosticState() {
  return {
    units: new Set(),
    behaviours: new Set(),
    resolvedUnitFactories: 0,
    resolvedBehaviourFactories: 0,
    fallbackBehaviours: 0,
  };
}

function validateBehaviour(id, behaviour) {
  if (!['behaviour', 'behaviour-group'].includes(behaviour?.kind)) {
    throw new TypeError(`Behaviour factory ${id} did not return a Behaviour`);
  }
}

function attachPendingBehaviours(root, pending) {
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const behaviour = pending[index];
    const unit = behaviour.channel === 'canvas-draw'
      ? findUnit(root, (candidate) => candidate.backend === 'canvas')
      : behaviour.channel === 'three-effect'
        ? findUnit(root, (candidate) => candidate.backend === 'three')
        : root?.kind === 'unit' ? root : null;
    if (!unit) continue;
    pending.splice(index, 1);
    unit.behaviours.push(behaviour.attach(unit));
  }
}

function findUnit(value, predicate, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (value.kind === 'unit' && predicate(value)) return value;
  const children = value.kind === 'unit' ? value.children : Array.isArray(value) ? value : [];
  for (const child of children) {
    const found = findUnit(child, predicate, seen);
    if (found) return found;
  }
  return null;
}

function attachNestedBehaviours(unit, value, path, seen = new WeakSet()) {
  if (value?.kind === 'behaviour-group') {
    value.attach(unit, path);
    unit.behaviours.push(...value.behaviours);
    value.behaviours.forEach((behaviour) => behaviour.onAdded());
    return;
  }
  if (value?.kind === 'behaviour') {
    unit.behaviours.push(value.attach(unit, path));
    value.onAdded();
    return;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) => attachNestedBehaviours(unit, nested, [...path, index], seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    attachNestedBehaviours(unit, nested, [...path, key], seen);
  }
}

function inferReactDriver() {
  const React = globalThis.React;
  if (!React) throw new Error('No CBA driver configured and globalThis.React is unavailable');
  return createReactDriver(React);
}

function asFactoryMap(value) {
  const map = new Map();
  addFactories(map, value);
  return map;
}

function addFactories(target, value) {
  if (!value) return;
  const entries = value instanceof Map ? value : Object.entries(value);
  for (const [id, factory] of entries) target.set(id, factory);
}

export const __cba = createRuntime();
