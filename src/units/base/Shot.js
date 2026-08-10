import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite, localContext, positive } from '@cut3/agent-memory/core/timeline';

const RECONCILIATION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

export class Shot extends Unit {
  static kind = 'unit.shot';

  constructor(unit, options = {}) {
    super(unit);
    const from = safeFrame(options.from ?? 0, 'shot.from');
    const duration = positiveFrame(options.duration ?? 1, 'shot.duration');
    const premountFor = nonNegativeFrame(options.premountFor ?? 0, 'shot.premountFor');
    const reconciliationKey = stableReconciliationKey(options.reconciliationKey);
    if (!Number.isSafeInteger(from - premountFor)
      || !Number.isSafeInteger(from + duration)) {
      throw new RangeError('shot mount range must stay within safe integer frames');
    }
    defineStableTimeline(this, { duration, from, premountFor, reconciliationKey });
    this.name = String(options.name ?? 'shot');
  }

  mountPhase(context) {
    const frame = finite(context?.frame, 'shot context.frame');
    if (frame >= this.from && frame < this.from + this.duration) return 'active';
    if (frame >= this.from - this.premountFor && frame < this.from) return 'premount';
    return 'inactive';
  }

  isActive(context) {
    return this.mountPhase(context) === 'active';
  }

  isVisible(context) {
    return this.mountPhase(context) !== 'inactive';
  }

  contextForChildren(context) {
    return localContext(context, this.from);
  }
}

function safeFrame(value, name) {
  finite(value, name);
  if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer frame`);
  return value;
}

function positiveFrame(value, name) {
  positive(value, name);
  return safeFrame(value, name);
}

function nonNegativeFrame(value, name) {
  const frame = safeFrame(value, name);
  if (frame < 0) throw new RangeError(`${name} must be non-negative`);
  return frame;
}

function stableReconciliationKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !RECONCILIATION_KEY.test(value)) {
    throw new TypeError('shot.reconciliationKey must be a stable identifier');
  }
  return value;
}

function defineStableTimeline(shot, values) {
  Object.defineProperties(shot, Object.fromEntries(Object.entries(values).map(([name, value]) => [
    name,
    {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    },
  ])));
}
