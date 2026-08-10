import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { clamp } from '@cut3/agent-memory/core/timeline';
import {
  requireTerminalTextTarget,
  terminalTextTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const CADENCES = Object.freeze({
  'pixel-crt': Object.freeze({ mode: 'duration', seconds: 1.8, start: 0 }),
  'soft-speaker': Object.freeze({ mode: 'per-second', rate: 22, start: 4 }),
  'bevel-status': Object.freeze({ mode: 'per-second', rate: 28, start: 0 }),
  'tagged-status': Object.freeze({ mode: 'per-frame', rate: 1.7, start: 0 }),
  'press-start-crt': Object.freeze({ mode: 'per-second', rate: 18, start: 0 }),
  'steel-speaker': Object.freeze({ mode: 'per-second', rate: 28, start: 0 }),
});

/** Exact authored per-character reveal law, independent of runtime copy. */
export class TerminalTextCadence extends Behaviour {
  static kind = 'behaviour.blue-terminal.text-cadence';

  #source;

  #recipe;

  constructor(unit) {
    super(requireTerminalTextTarget(unit, 'TerminalTextCadence'));
    this.#recipe = terminalTextTarget(unit, 'TerminalTextCadence').recipe;
    if (!CADENCES[this.#recipe]) throw new TypeError('TerminalTextCadence recipe is not authored');
    this.#source = String(unit.text);
  }

  onFrame({ frame, fps }) {
    const visible = terminalVisibleCharacters(
      this.#recipe,
      this.#source.length,
      frame,
      fps,
    );
    this.unit.text = this.#source.slice(0, visible);
  }
}

export function terminalVisibleCharacters(recipe, length, frame, fps) {
  const cadence = CADENCES[String(recipe)];
  if (!cadence) throw new TypeError('Terminal cadence recipe is not authored');
  let visible;
  if (cadence.mode === 'duration') {
    const duration = Math.max(1, Math.round(fps * cadence.seconds));
    visible = Math.floor(length * clamp((frame - cadence.start) / duration));
  } else if (cadence.mode === 'per-frame') {
    visible = Math.floor(Math.max(0, frame - cadence.start) * cadence.rate);
  } else {
    visible = Math.floor((Math.max(0, frame - cadence.start) / fps) * cadence.rate);
  }
  return Math.min(length, visible);
}
