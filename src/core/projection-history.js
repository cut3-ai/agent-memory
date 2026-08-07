import { plainDataEqual } from '@cut3/agent-memory/core/state';

const ownerConfigurations = new WeakMap();
const sessionHistory = new WeakMap();
const treeConfigurations = new WeakMap();

export function ownerSignature(record) {
  const candidate = Object.freeze({
    baseline: record.baseline,
    behaviours: record.structure.behaviours,
    parent: record.structure.parent,
    units: record.structure.units,
  });
  const configurations = ownerConfigurations.get(record.unit) ?? [];
  const existing = configurations.find((signature) => sameOwnerSignature(signature, candidate));
  if (existing) return existing;
  configurations.push(candidate);
  ownerConfigurations.set(record.unit, configurations);
  return candidate;
}

export function treeSignature(root, records) {
  const candidate = Object.freeze(records.map((record) => Object.freeze({
    owner: record.signature,
    unit: record.unit,
  })));
  const configurations = treeConfigurations.get(root) ?? [];
  const existing = configurations.find((signature) => sameTreeSignature(signature, candidate));
  if (existing) return existing;
  configurations.push(candidate);
  treeConfigurations.set(root, configurations);
  return candidate;
}

export function sameTraversal(left, right) {
  return Boolean(left)
    && left.unit === right.unit
    && left.context === right.context
    && left.visible === right.visible
    && sameReferences(left.children, right.children);
}

/**
 * Remember one compact result per context for the lifetime of a live root.
 *
 * Exact owner/tree signatures separate intentional configuration changes. The
 * cross-call result is a non-cryptographic 128-bit multi-hash so a theoretical
 * collision can mask drift; the two passes inside one session remain exact and
 * never rely on this fingerprint.
 */
export function verifyProjectionSession(transaction, projections, visits) {
  const { context, scope, target } = sessionAddress(transaction, projections, visits);
  const targets = sessionHistory.get(transaction.root) ?? new Map();
  const contexts = targets.get(target) ?? new Map();
  const key = `${scope}\u0000${context}`;
  const configurations = contexts.get(key) ?? [];
  const previous = configurations.find((entry) => sameTreeSignature(
    entry.signature,
    transaction.signature,
  ));
  const fingerprint = sessionFingerprint(transaction, scope, projections, visits);

  if (previous) {
    if (previous.fingerprint !== fingerprint) {
      throw new TypeError(
        'Frame traversal changed for the same frame input or projection output drifted',
      );
    }
    return;
  }

  configurations.push(Object.freeze({
    fingerprint,
    signature: transaction.signature,
  }));
  contexts.set(key, configurations);
  targets.set(target, contexts);
  sessionHistory.set(transaction.root, targets);
}

function sessionAddress(transaction, projections, visits) {
  if (visits.length > 0) {
    return {
      context: visits[0].context,
      scope: 'frame',
      target: visits[0].unit,
    };
  }
  if (projections.length > 0) {
    return {
      context: projections[0].context,
      scope: projections.length === 1 ? 'unit' : `units:${projections.length}`,
      target: projections[0].unit,
    };
  }
  return { context: 'empty', scope: 'empty', target: transaction.root };
}

function sessionFingerprint(transaction, scope, projections, visits) {
  const hash = createMultiHash();
  hash.token('cut3.projection-session.v1');
  hash.token(scope);
  hash.token(projections.length);
  for (const projection of projections) {
    hash.token('projection');
    hashUnit(hash, transaction, projection.unit);
    hash.token(projection.context);
    hashPlainValue(hash, projection.output);
  }
  hash.token(visits.length);
  for (const visit of visits) {
    hash.token('visit');
    hashUnit(hash, transaction, visit.unit);
    hash.token(visit.context);
    hash.token(visit.visible ? 'visible' : 'hidden');
    hash.token(visit.children.length);
    for (const child of visit.children) hashUnit(hash, transaction, child);
  }
  return hash.digest();
}

function hashUnit(hash, transaction, unit) {
  const record = transaction.byUnit.get(unit);
  if (!record) throw new TypeError('Projection fingerprint contains a foreign Unit');
  hash.token(record.index);
}

function hashPlainValue(hash, value) {
  if (value === null) {
    hash.token('null');
    return;
  }
  switch (typeof value) {
    case 'undefined':
      hash.token('undefined');
      return;
    case 'boolean':
      hash.token(value ? 'boolean:true' : 'boolean:false');
      return;
    case 'string':
      hash.token('string');
      hash.token(value);
      return;
    case 'number':
      hash.token('number');
      hash.token(numberKey(value));
      return;
    case 'bigint':
      hash.token('bigint');
      hash.token(value.toString());
      return;
    case 'object':
      hashPlainObject(hash, value);
      return;
    default:
      throw new TypeError('Projection fingerprint requires plain data');
  }
}

function hashPlainObject(hash, value) {
  if (Array.isArray(value)) {
    hash.token('array');
    hash.token(value.length);
    for (let index = 0; index < value.length; index += 1) {
      if (Object.hasOwn(value, index)) {
        hash.token('item');
        hashPlainValue(hash, value[index]);
      } else {
        hash.token('hole');
      }
    }
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Projection fingerprint requires plain data');
  }
  const keys = Object.keys(value).sort();
  hash.token('object');
  hash.token(keys.length);
  for (const key of keys) {
    hash.token(key);
    hashPlainValue(hash, value[key]);
  }
}

function numberKey(value) {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return '+Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

function createMultiHash() {
  const states = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes = [0x01000193, 0x27d4eb2f, 0x165667b1, 0x85ebca77];
  const mix = (value) => {
    for (let index = 0; index < states.length; index += 1) {
      let state = Math.imul(states[index] ^ value, primes[index]);
      state ^= state >>> 16;
      states[index] = state >>> 0;
    }
  };
  return Object.freeze({
    digest() {
      return states.map((state) => state.toString(16).padStart(8, '0')).join('');
    },
    token(value) {
      const text = String(value);
      mix(text.length);
      for (let index = 0; index < text.length; index += 1) mix(text.charCodeAt(index));
      mix(0x10ffff);
    },
  });
}

function sameOwnerSignature(left, right) {
  return left === right || (left.parent === right.parent
    && sameReferences(left.units, right.units)
    && sameReferences(left.behaviours, right.behaviours)
    && plainDataEqual(left.baseline, right.baseline));
}

export function sameTreeSignature(left, right) {
  return left === right || (left.length === right.length && left.every((entry, index) => (
    entry.unit === right[index].unit
    && sameOwnerSignature(entry.owner, right[index].owner)
  )));
}

function sameReferences(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
