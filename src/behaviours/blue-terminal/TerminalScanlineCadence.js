import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';

const SCANLINES = Object.freeze({
  'pixel-crt': Object.freeze({ base: 0.04, phase: 0.2, wave: 0.01 }),
  'soft-speaker': Object.freeze({ base: 0, phase: 0, wave: 0 }),
  'bevel-status': Object.freeze({ base: 0, phase: 0, wave: 0 }),
  'tagged-status': Object.freeze({ base: 0, phase: 0, wave: 0 }),
  'press-start-crt': Object.freeze({ base: 0.10, phase: 0, wave: 0 }),
  'steel-speaker': Object.freeze({ base: 0.18, phase: 0, wave: 0 }),
});

/** Authored scanline phosphor opacity, including the one sinusoidal CRT drift. */
export class TerminalScanlineCadence extends Behaviour {
  static kind = 'behaviour.blue-terminal.scanline-cadence';

  #scanlines;

  constructor(unit, recipe) {
    super(requireOwnerKind(unit, 'unit.blue-terminal.scanline-field', 'TerminalScanlineCadence'));
    this.#scanlines = SCANLINES[String(recipe)];
    if (!this.#scanlines) throw new TypeError('TerminalScanlineCadence recipe is not authored');
  }

  onFrame({ frame }) {
    this.unit.opacity = this.#scanlines.base
      + (Math.sin(frame * this.#scanlines.phase) * this.#scanlines.wave);
  }
}
