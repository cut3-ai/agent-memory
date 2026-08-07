import { requireUnit } from '@cut3/agent-memory/core/identity';
import { withProjectionSession } from '@cut3/agent-memory/core/projection';
import { frameContext } from '@cut3/agent-memory/core/timeline';

/** Evaluate one Unit while locking and restoring its entire ownership tree. */
export function projectUnit(unit, input = {}) {
  requireUnit(unit);
  return withProjectionSession(unit, ({ project }) => project(unit, input));
}

/**
 * Project every visible Unit in one root transaction.
 *
 * A frame performs two deterministic linear passes while the complete tree is
 * structurally locked. Renderers consume the immutable first-pass snapshots
 * only after the tree has been restored.
 */
export function projectFrame(root, input = {}) {
  requireUnit(root, 'frame root');
  const context = frameContext(input);
  return withProjectionSession(root, (session) => {
    const entries = new Map();
    collectFrame(root, context, session, entries, new Set(), Object.freeze([]));
    return projectedFrame(entries);
  });
}

function collectFrame(unit, context, session, entries, active, ancestry) {
  if (active.has(unit)) throw new TypeError('A Unit tree cannot contain a cycle');
  active.add(unit);
  try {
    const normalizedContext = frameContext(context);
    const visible = Boolean(unit.isVisible(context));
    if (!visible) {
      session.visit(unit, normalizedContext, false, []);
      return;
    }
    const state = session.project(unit, normalizedContext);
    unit.validateProjection(normalizedContext, ancestry);
    const childContext = unit.contextForChildren(context);
    const children = Object.freeze([...unit.children]);
    session.visit(unit, normalizedContext, true, children);
    entries.set(unit, Object.freeze({
      children,
      context: normalizedContext,
      state,
    }));
    const childAncestry = Object.freeze([
      ...ancestry,
      Object.freeze({ state, unit }),
    ]);
    for (const child of children) {
      collectFrame(child, childContext, session, entries, active, childAncestry);
    }
  } finally {
    active.delete(unit);
  }
}

function projectedFrame(entries) {
  return Object.freeze({
    childrenOf(unit) {
      return requireProjected(entries, unit).children;
    },
    contextOf(unit) {
      return requireProjected(entries, unit).context;
    },
    has(unit) {
      requireUnit(unit);
      return entries.has(unit);
    },
    stateOf(unit) {
      return requireProjected(entries, unit).state;
    },
  });
}

function requireProjected(entries, unit) {
  requireUnit(unit);
  const entry = entries.get(unit);
  if (!entry) throw new TypeError('Unit is not visible in this projected frame');
  return entry;
}
