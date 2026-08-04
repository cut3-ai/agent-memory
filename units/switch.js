import {
  immutableValue,
  isSignal,
  isSignalValue,
  sample,
} from '../core/signals.js';
import { requireUnit, Unit } from '../core/Unit.js';

export class Switch extends Unit {
  static kind = 'unit.switch';

  #selector;
  #cases;

  constructor(selector, cases) {
    const entries = Object.entries(cases ?? {});
    if (entries.length === 0) throw new TypeError('Switch requires at least one case');
    entries.forEach(([name, unit]) => requireUnit(unit, `case ${name}`));
    if (!isSignalValue(selector)) {
      throw new TypeError('Switch selector must be plain data or a built-in Signal');
    }
    super();
    this.add(...entries.map(([, unit]) => unit));
    this.#selector = isSignal(selector) ? selector : immutableValue(selector);
    this.#cases = new Map(entries.map(([name, unit]) => [name, unit]));
  }

  selected(context = {}) {
    return this.#cases.get(String(sample(this.#selector, context))) ?? null;
  }
}
