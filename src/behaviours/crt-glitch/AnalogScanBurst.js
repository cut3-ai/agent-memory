import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  cubicBezier,
  interpolateRange,
} from '@cut3/agent-memory/core/timeline';
import {
  requireCrtSignalTarget,
} from '@cut3/agent-memory/units/crt-glitch/CrtGlitchField';

const ENTRY_EASE = cubicBezier(0.16, 1, 0.3, 1);
const EXIT_EASE = cubicBezier(0.45, 0, 0.55, 1);
const EXIT_SPLIT_EASE = cubicBezier(0.34, 1.56, 0.64, 1);

/** Complete seeded CRT law: emulsion grain, scan optics and RGB glyph breakup. */
export class AnalogScanBurst extends Behaviour {
  static kind = 'behaviour.crt-glitch.analog-scan-burst';

  #variant;

  constructor(signal) {
    const target = requireCrtSignalTarget(signal);
    super(target.owner);
    this.#variant = target.variant;
  }

  onFrame({ duration, fps, frame }) {
    if (this.#variant === 'film-field') {
      this.unit.frameState = {
        frame,
        grainSeed: (frame * 7919) + 104729,
      };
      return;
    }
    this.unit.frameState = glitchTitleState(frame, duration, fps);
  }
}

function glitchTitleState(frame, duration, fps) {
  const entryDuration = Math.round(0.4 * fps);
  const exitDuration = Math.round(0.4 * fps);
  const exitStart = Math.max(entryDuration, duration - exitDuration);
  const glitchInterval = Math.round(0.6 * fps);
  const glitchPhase = Math.floor(frame / glitchInterval);
  const frameInPhase = frame % glitchInterval;
  const shouldMidGlitch = pseudoRandom((glitchPhase * 1000) + 42) > 0.5
    && frameInPhase < 4
    && frame > entryDuration
    && frame < exitStart;
  const midGlitchIntensity = shouldMidGlitch
    ? pseudoRandom((glitchPhase * 2000) + 77)
    : 0;
  const isEntry = frame < entryDuration;
  const entryProgress = isEntry ? frame / entryDuration : 1;
  const isExit = frame >= exitStart;
  const exitProgress = isExit ? (frame - exitStart) / exitDuration : 0;
  let opacity = 1;
  if (isEntry) {
    opacity = interpolateRange(
      frame,
      [0, entryDuration * 0.35, entryDuration],
      [0, 0.65, 1],
      { easing: ENTRY_EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    const flickerDepth = (1 - entryProgress) * 0.55;
    if (pseudoRandom((frame * 11) + 3) > 0.55) {
      opacity = Math.max(0.08, opacity - flickerDepth);
    }
  }
  if (isExit) {
    const baseExit = interpolateRange(
      exitProgress,
      [0, 0.4, 1],
      [1, 0.55, 0],
      { easing: EXIT_EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    opacity = pseudoRandom((frame * 13) + 7) > 0.5
      ? baseExit * (pseudoRandom((frame * 19) + 1) > 0.65 ? 0.15 : 0.7)
      : baseExit;
  }
  let splitAmount = 0;
  let shakeY = 0;
  if (isEntry) {
    const baseSplit = interpolateRange(
      entryProgress,
      [0, 0.35, 1],
      [16, 9, 0],
      { easing: ENTRY_EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    splitAmount = baseSplit
      + ((pseudoRandom((frame * 3) + 5) - 0.5) * 10 * (1 - entryProgress));
    shakeY = (pseudoRandom((frame * 5) + 1) - 0.5) * 6 * (1 - entryProgress);
  } else if (shouldMidGlitch) {
    splitAmount = 8 + (midGlitchIntensity * 10);
    shakeY = (pseudoRandom((frame * 17) + 3) - 0.5) * 5;
  } else if (isExit) {
    splitAmount = interpolateRange(
      exitProgress,
      [0, 0.5, 1],
      [0, 10, 22],
      { easing: EXIT_SPLIT_EASE, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    shakeY = (pseudoRandom((frame * 11) + 9) - 0.5) * 5 * exitProgress;
  }

  return {
    frame,
    opacity,
    shakeY,
    splitAmount,
  };
}

function pseudoRandom(seed) {
  const value = Math.sin((seed * 127.1) + 311.7) * 43758.5453;
  return value - Math.floor(value);
}
