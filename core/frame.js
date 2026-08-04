import { requireConcreteKind } from './identity.js';
import { frameContext, immutableValue } from './signals.js';
import {
  capturePublicState,
  clonePlain,
  publicSnapshot,
  restorePublicState,
} from './state.js';
import { isUnit } from './Unit.js';

/**
 * Evaluate a Unit at one absolute frame.
 * Behaviour mutations run transactionally. Atomic write ownership is inferred
 * from the semantic state actually changed; classes carry no routing metadata.
 */
export function projectUnit(unit, input = {}) {
  if (!isUnit(unit)) throw new TypeError('projectUnit() requires a Unit');
  const context = frameContext(input);
  const originalState = capturePublicState(unit);
  const original = publicSnapshot(unit);
  const projection = clonePlain(original);
  const occupied = [];
  try {
    for (const behaviour of unit.behaviours) {
      const kind = requireConcreteKind(behaviour, 'behaviour');
      // Every Behaviour is measured against the same owner state. This keeps
      // atomicity inference independent of add order and catches equal-value
      // writes by two different Behaviours.
      restorePublicState(unit, originalState);
      const before = publicSnapshot(unit);
      const returned = behaviour.onFrame(context);
      if (returned !== undefined) {
        throw new TypeError(`${kind} onFrame() must mutate its constructor Unit`);
      }
      const after = publicSnapshot(unit);
      const changed = changedLeafPaths(before, after);
      const writes = [...new Set(changed.map(normalizeVisualWrite))];
      if (writes.length > 1) {
        throw new TypeError(`${kind} changes more than one visual concern`);
      }
      if (writes.length === 1) {
        const [write] = writes;
        if (occupied.some((current) => pathsOverlap(current, write))) {
          throw new TypeError(`More than one Behaviour changes ${write}`);
        }
        occupied.push(write);
      }
      for (const path of changed) applyPath(projection, after, path);
    }
    return immutableValue(projection);
  } finally {
    restorePublicState(unit, originalState);
  }
}

export function visitUnits(root, visitor) {
  if (!isUnit(root)) throw new TypeError('visitUnits() requires a Unit');
  if (typeof visitor !== 'function') throw new TypeError('visitor must be a function');
  const seen = new Set();
  const walk = (unit) => {
    if (seen.has(unit)) return;
    seen.add(unit);
    visitor(unit);
    unit.children.forEach(walk);
  };
  walk(root);
  return root;
}

function changedLeafPaths(before, after, prefix = []) {
  if (Object.is(before, after)) return [];
  if (isRecord(before) || isRecord(after)) {
    const left = isRecord(before) ? before : {};
    const right = isRecord(after) ? after : {};
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].flatMap((key) => changedLeafPaths(left[key], right[key], [...prefix, key]));
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    const left = Array.isArray(before) ? before : [];
    const right = Array.isArray(after) ? after : [];
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => changedLeafPaths(
      left[index], right[index], [...prefix, String(index)],
    )).flat();
  }
  return [prefix.join('.')];
}

function pathWithin(actual, declared) {
  return actual === declared || actual.startsWith(`${declared}.`);
}

function normalizeVisualWrite(path) {
  const parts = path.split('.');
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
}

function applyPath(target, source, path) {
  const parts = path.split('.');
  const final = parts.pop();
  let targetParent = target;
  let sourceParent = source;
  for (const part of parts) {
    sourceParent = sourceParent?.[part];
    if (!targetParent[part] || typeof targetParent[part] !== 'object') {
      targetParent[part] = Array.isArray(sourceParent) ? [] : {};
    }
    targetParent = targetParent[part];
  }
  if (sourceParent && Object.hasOwn(sourceParent, final)) {
    targetParent[final] = clonePlain(sourceParent[final]);
  } else {
    delete targetParent[final];
  }
}

function pathsOverlap(left, right) {
  return pathWithin(left, right) || pathWithin(right, left);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
