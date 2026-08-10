import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { terminalVisibleCharacters } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalTextCadence';

const CURSORS = Object.freeze({
  'pixel-crt': cursor('conditional-blink-after', 'seconds', 0.35),
  'soft-speaker': cursor('conditional-blink-after', 'frames', 18),
  'bevel-status': cursor('hidden-placeholder', 'frames', 1),
  'tagged-status': cursor('reserved-blink-before', 'frames', 14),
  'press-start-crt': cursor('reserved-blink-before', 'frames', 8),
  'steel-speaker': cursor('reserved-blink-before', 'frames', 5),
});

/** Inline cursor presence and blink law tied to runtime message completion. */
export class TerminalCursorCadence extends Behaviour {
  static kind = 'behaviour.blue-terminal.cursor-cadence';

  #characters;

  #cursor;

  #recipe;

  constructor(unit, recipe, characterCount) {
    super(requireOwnerKind(unit, 'unit.blue-terminal.cursor', 'TerminalCursorCadence'));
    this.#recipe = String(recipe);
    this.#cursor = CURSORS[this.#recipe];
    if (!this.#cursor) throw new TypeError('TerminalCursorCadence recipe is not authored');
    this.#characters = Number(characterCount);
    if (!Number.isInteger(this.#characters) || this.#characters < 0) {
      throw new TypeError('TerminalCursorCadence characterCount must be a non-negative integer');
    }
  }

  onFrame({ frame, fps }) {
    const complete = terminalVisibleCharacters(
      this.#recipe,
      this.#characters,
      frame,
      fps,
    ) >= this.#characters;
    const period = this.#cursor.periodKind === 'seconds'
      ? Math.max(1, Math.round(fps * this.#cursor.period))
      : this.#cursor.period;
    const blink = Math.floor(frame / period) % 2 === 0;
    const state = cursorState(this.#cursor.mode, complete, blink);

    this.unit.present = state.present;
    this.unit.opacity = state.opacity;
    this.unit.effects = {
      ...this.unit.effects,
      shadow: state.opacity > 0 ? this.unit.effects.shadow : 'none',
    };
  }
}

function cursor(mode, periodKind, period) {
  return Object.freeze({ mode, period, periodKind });
}

function cursorState(mode, complete, blink) {
  if (mode === 'conditional-blink-after') {
    const present = !complete || blink;
    return { opacity: Number(present), present };
  }
  if (mode === 'hidden-placeholder') {
    return { opacity: 0, present: !complete };
  }
  return { opacity: Number(!complete && blink), present: !complete };
}
