import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { terminalVisibleCharacters } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalTextCadence';

const INDICATORS = Object.freeze({
  'pixel-crt': indicator('pulse-color', 'seconds', 0.15, '#aaccff', '#4466aa', 0),
  'soft-speaker': indicator('never', 'frames', 1, 'transparent', 'transparent', 0),
  'bevel-status': indicator('conditional-blink', 'seconds', 0.4, '#a0c8ff', '#a0c8ff', 0),
  'tagged-status': indicator('alternate-color', 'frames', 14, '#88aaff', '#4466cc', -3),
  'press-start-crt': indicator('reserved-blink', 'frames', 8, '#ffe080', '#ffe080', -2),
  'steel-speaker': indicator('reserved-blink', 'frames', 10, '#ffffff', '#ffffff', 0),
});

/** Completion-marker blink, color and authored nudge law. */
export class TerminalIndicatorCadence extends Behaviour {
  static kind = 'behaviour.blue-terminal.indicator-cadence';

  #characters;

  #indicator;

  #recipe;

  constructor(unit, recipe, characterCount) {
    super(requireOwnerKind(unit, 'unit.blue-terminal.indicator', 'TerminalIndicatorCadence'));
    this.#recipe = String(recipe);
    this.#indicator = INDICATORS[this.#recipe];
    if (!this.#indicator) throw new TypeError('TerminalIndicatorCadence recipe is not authored');
    this.#characters = Number(characterCount);
    if (!Number.isInteger(this.#characters) || this.#characters < 0) {
      throw new TypeError('TerminalIndicatorCadence characterCount must be a non-negative integer');
    }
  }

  onFrame({ frame, fps }) {
    const complete = terminalVisibleCharacters(
      this.#recipe,
      this.#characters,
      frame,
      fps,
    ) >= this.#characters;
    const period = this.#indicator.periodKind === 'seconds'
      ? Math.max(1, Math.round(fps * this.#indicator.period))
      : this.#indicator.period;
    const blink = Math.floor(frame / period) % 2 === 0;
    const pulse = ((Math.sin(frame * 0.15) + 1) / 2) > 0.65;
    const state = indicatorState(this.#indicator, complete, blink, pulse);

    this.unit.present = state.present;
    this.unit.opacity = state.opacity;
    this.unit.paint = {
      ...this.unit.paint,
      color: state.color,
    };
    this.unit.pose = {
      ...this.unit.pose,
      y: state.y,
    };
  }
}

function indicator(mode, periodKind, period, onColor, offColor, activeY) {
  return Object.freeze({ activeY, mode, offColor, onColor, period, periodKind });
}

function indicatorState(authored, complete, blink, pulse) {
  if (!complete || authored.mode === 'never') return state(false, 0, authored.offColor, 0);
  if (authored.mode === 'conditional-blink') {
    return state(blink, Number(blink), authored.onColor, authored.activeY);
  }
  if (authored.mode === 'reserved-blink') {
    return state(true, Number(blink), authored.onColor, authored.activeY);
  }
  if (authored.mode === 'alternate-color') {
    return state(true, 1, blink ? authored.onColor : authored.offColor, blink ? authored.activeY : 0);
  }
  return state(true, 1, pulse ? authored.onColor : authored.offColor, 0);
}

function state(present, opacity, color, y) {
  return { color, opacity, present, y };
}
