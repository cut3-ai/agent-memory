import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  easeOutCubic,
  lerp,
  progress,
} from '@cut3/agent-memory/core/timeline';
import {
  requireTerminalTextTarget,
  terminalTextTarget,
} from '@cut3/agent-memory/units/blue-terminal/terminalSemantics';

const START_FRAME = 10;
const CADENCE = Object.freeze([2, 1, 1, 0, 3, 1, 2, 0]);
const CHARACTERS_PER_CYCLE = CADENCE.reduce((sum, amount) => sum + amount, 0);

/** Uneven terminal typing with a held block cursor and cobalt phosphor echo. */
export class TerminalMessageCadence extends Behaviour {
  static kind = 'behaviour.blue-terminal.message-cadence';

  #characters;

  constructor(unit) {
    super(requireTerminalTextTarget(unit, 'TerminalMessageCadence'));
    if (terminalTextTarget(unit, 'TerminalMessageCadence').recipe !== 'message-study') {
      throw new TypeError('TerminalMessageCadence requires a message-study target');
    }
    this.#characters = Object.freeze(Array.from(unit.text));
  }

  onFrame({ frame }) {
    const elapsed = Math.floor(frame) - START_FRAME;
    const visible = revealedCharacters(elapsed, this.#characters.length);
    const complete = visible >= this.#characters.length;
    const cursorOn = elapsed >= 0 && Math.floor(elapsed / 5) % 2 === 0;
    const cursor = elapsed >= 0 && (!complete || cursorOn) ? '▌' : '';
    const focus = easeOutCubic(progress(frame, START_FRAME, 14));

    this.unit.text = `${this.#characters.slice(0, visible).join('')}${cursor}`;
    this.unit.opacity = progress(frame, START_FRAME - 2, 3);
    this.unit.typography = {
      ...this.unit.typography,
      family: "'Press Start 2P', monospace",
      letterSpacing: lerp(1.6, 0, focus),
      lineHeight: 1.45,
      size: 32,
      transform: 'none',
      weight: 400,
    };
    this.unit.effects = {
      ...this.unit.effects,
      blur: 0,
      brightness: cursorOn ? 1.12 : 1,
      contrast: 1.08,
      shadow: cursorOn ? '3px 0 0 #4488ff' : '2px 3px 0 #001055',
    };
  }
}

function revealedCharacters(elapsed, length) {
  if (elapsed < 0) return 0;
  const steps = elapsed + 1;
  const cycles = Math.floor(steps / CADENCE.length);
  const remainder = steps % CADENCE.length;
  const tail = CADENCE.slice(0, remainder).reduce((sum, amount) => sum + amount, 0);
  return Math.min(length, (cycles * CHARACTERS_PER_CYCLE) + tail);
}
