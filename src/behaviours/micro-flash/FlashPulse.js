import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { progress } from '@cut3/agent-memory/core/timeline';

export const FLASH_DURATION_IN_FRAMES = 7;
export const FLASH_TIMINGS = Object.freeze({
  LAST_RENDERED_FRAME: 'last-rendered-frame',
  DURATION_ENDPOINT: 'duration-endpoint',
});

const TIMINGS = new Set(Object.values(FLASH_TIMINGS));

/** Seven-frame color pulse with one exact normalized rise-and-fall envelope. */
export class FlashPulse extends Behaviour {
  static kind = 'behaviour.micro-flash.pulse';

  #color;
  #timing;

  constructor(unit, color, timing = FLASH_TIMINGS.LAST_RENDERED_FRAME) {
    super(requireOwnerKind(unit, 'unit.micro-flash.card', 'FlashPulse'));
    if (!TIMINGS.has(timing)) throw new RangeError('FlashPulse timing is invalid');
    this.#color = String(color);
    this.#timing = timing;
  }

  onFrame({ frame }) {
    const endFrame = this.#timing === FLASH_TIMINGS.DURATION_ENDPOINT
      ? FLASH_DURATION_IN_FRAMES
      : FLASH_DURATION_IN_FRAMES - 1;
    const normalized = progress(frame, 0, endFrame);
    const opacity = normalized <= 0.3
      ? normalized / 0.3
      : (1 - normalized) / 0.7;
    this.unit.style = {
      ...this.unit.style,
      background: this.#color,
      opacity,
    };
  }
}
