import { requireUnit } from '@cut3/agent-memory/core/identity';
import {
  ownerSignature,
  sameTraversal,
  treeSignature,
  verifyProjectionSession,
} from '@cut3/agent-memory/core/projection-history';
import {
  capturePublicState,
  freezePublicState,
  matchesPublicState,
  plainDataEqual,
  publicSnapshot,
  restorePublicState,
} from '@cut3/agent-memory/core/state';
import { frameContext } from '@cut3/agent-memory/core/timeline';

export const BEGIN_PROJECTION = Symbol('cut3.begin-projection');
export const RESET_PROJECTION = Symbol('cut3.reset-projection');
export const END_PROJECTION = Symbol('cut3.end-projection');

/** Run two deterministic projection passes inside one whole-tree transaction. */
export function withProjectionSession(anchor, evaluate) {
  requireUnit(anchor, 'projection anchor');
  if (typeof evaluate !== 'function') throw new TypeError('projection evaluator must be a function');
  const transaction = beginTreeProjection(anchor);
  try {
    const firstPass = createProjectionPass(transaction);
    const first = evaluate(firstPass.api);
    assertTreePublicStateUnchanged(transaction);
    resetTreeProjection(transaction);

    const secondPass = createProjectionPass(transaction, firstPass);
    evaluate(secondPass.api);
    assertSamePass(firstPass, secondPass);
    assertTreePublicStateUnchanged(transaction);
    verifyProjectionSession(transaction, firstPass.projections, firstPass.visits);
    return first;
  } finally {
    endTreeProjection(transaction);
  }
}

function createProjectionPass(transaction, expectedPass) {
  const projections = [];
  const visits = [];
  return {
    api: Object.freeze({
      project: createProjector(transaction, projections, expectedPass?.projections),
      visit: createVisitor(transaction, visits, expectedPass?.visits),
    }),
    projections,
    visits,
  };
}

function createProjector(transaction, entries, expectedEntries) {
  const visited = new Set();
  return (unit, input = {}) => {
    if (!transaction.active) throw new TypeError('Projection session is closed');
    requireUnit(unit);
    const record = transaction.byUnit.get(unit);
    if (!record) throw new TypeError('Projected Unit must belong to the locked frame tree');
    if (visited.has(unit)) throw new TypeError('A Unit may only be projected once per frame pass');
    visited.add(unit);

    if (!matchesPublicState(unit, record.state)) {
      throw new TypeError('A Behaviour may only mutate its owner');
    }

    const context = frameContext(input);
    let output;
    try {
      output = runBehaviours(unit, context);
    } finally {
      restorePublicState(unit, record.state);
    }

    const entry = Object.freeze({
      context: contextKey(context),
      output,
      signature: record.signature,
      unit,
    });
    if (expectedEntries) assertSameProjection(expectedEntries[entries.length], entry);
    entries.push(entry);
    return output;
  };
}

function createVisitor(transaction, visits, expectedVisits) {
  const visited = new Set();
  return (unit, context, visible, children) => {
    if (!transaction.active) throw new TypeError('Projection session is closed');
    requireUnit(unit);
    if (!transaction.byUnit.has(unit)) {
      throw new TypeError('Visited Unit must belong to the locked frame tree');
    }
    if (visited.has(unit)) throw new TypeError('A Unit may only be visited once per frame pass');
    visited.add(unit);
    const entry = Object.freeze({
      children: Object.freeze([...children]),
      context: contextKey(frameContext(context)),
      unit,
      visible: Boolean(visible),
    });
    if (expectedVisits && !sameTraversal(expectedVisits[visits.length], entry)) {
      throw new TypeError('Frame traversal changed between repeated evaluation');
    }
    visits.push(entry);
  };
}

function runBehaviours(unit, context) {
  for (const behaviour of unit.behaviours) {
    const result = behaviour.onFrame(context);
    if (result !== undefined) {
      throw new TypeError(`${behaviour.constructor.kind}.onFrame() must mutate its owner`);
    }
  }
  return publicSnapshot(unit);
}

function beginTreeProjection(unit) {
  const root = findRoot(unit);
  const records = collectTree(root).map((current) => {
    freezePublicState(current);
    return {
      baseline: publicSnapshot(current),
      state: capturePublicState(current),
      structure: null,
      unit: current,
    };
  });
  const begun = [];
  try {
    for (const record of records) {
      record.structure = record.unit[BEGIN_PROJECTION]();
      begun.push(record);
    }
  } catch (error) {
    for (const record of begun.reverse()) {
      record.unit[END_PROJECTION](record.structure);
    }
    throw error;
  }
  records.forEach((record, index) => {
    record.index = index;
    record.signature = ownerSignature(record);
  });
  return {
    active: true,
    byUnit: new Map(records.map((record) => [record.unit, record])),
    records,
    root,
    signature: treeSignature(root, records),
  };
}

function resetTreeProjection(transaction) {
  for (const record of [...transaction.records].reverse()) {
    record.unit[RESET_PROJECTION](record.structure);
  }
  restoreTreePublicState(transaction);
}

function endTreeProjection(transaction) {
  let cleanupError;
  for (const record of [...transaction.records].reverse()) {
    try {
      record.unit[END_PROJECTION](record.structure);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  try {
    restoreTreePublicState(transaction);
  } catch (error) {
    cleanupError ??= error;
  }
  transaction.active = false;
  if (cleanupError) throw cleanupError;
}

function restoreTreePublicState(transaction) {
  for (const record of transaction.records) restorePublicState(record.unit, record.state);
}

function assertTreePublicStateUnchanged(transaction) {
  if (transaction.records.some((record) => !matchesPublicState(record.unit, record.state))) {
    throw new TypeError('A Behaviour may only mutate its owner');
  }
}

function assertSamePass(firstPass, secondPass) {
  if (firstPass.projections.length !== secondPass.projections.length
    || firstPass.visits.length !== secondPass.visits.length) {
    throw new TypeError('Frame traversal changed between repeated evaluation');
  }
}

function assertSameProjection(expected, actual) {
  if (!expected
    || expected.unit !== actual.unit
    || expected.context !== actual.context) {
    throw new TypeError('Frame traversal changed between repeated evaluation');
  }
  if (!plainDataEqual(expected.output, actual.output)) {
    throw new TypeError('Behaviour returned different owner snapshots for repeated evaluation');
  }
}

function contextKey(context) {
  return [
    context.absoluteFrame,
    context.duration,
    context.fps,
    context.frame,
    context.height,
    context.width,
  ].map(numberKey).join('|');
}

function numberKey(value) {
  return Object.is(value, -0) ? '-0' : String(value);
}

function findRoot(unit) {
  const seen = new Set();
  let current = unit;
  while (current.parent) {
    if (seen.has(current)) throw new TypeError('A Unit tree cannot contain a cycle');
    seen.add(current);
    current = current.parent;
  }
  return current;
}

function collectTree(root) {
  const units = [];
  const seen = new Set();
  const visit = (unit) => {
    if (seen.has(unit)) throw new TypeError('A Unit tree cannot contain a cycle');
    seen.add(unit);
    units.push(unit);
    for (const child of unit.children) visit(child);
  };
  visit(root);
  return units;
}
