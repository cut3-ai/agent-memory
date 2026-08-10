import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { clamp } from '@cut3/agent-memory/core/timeline';

const FLASH_DURATION_MS = 80;
const FLASH_PEAK = 0.9;

const EXPOSURES = Object.freeze({
  'paired-tilt': frameExposure([0, 33], 5),
  'paired-snap': exposure([0, 558]),
  'blue-triptych': exposure([0, 743, 1486]),
  'balanced-triptych': exposure([0, 750, 1500]),
  'cover-triptych': exposure([0, 743, 1486]),
  'vignette-triptych': exposure([0, 735, 1470]),
  'four-beat-fade': Object.freeze({
    flash: timeFlashLaw(Object.freeze([0, 600, 1200, 1800])),
    grade: fadeGrade(2500, 496),
  }),
});

/** Owner-only exposure law for a white shutter plate or an authored grade plate. */
export class ExposureBloom extends Behaviour {
  static kind = 'behaviour.flash-photo.exposure-bloom';

  #channel;

  #law;

  constructor(unit, recipe, channel) {
    super(requireExposureOwner(unit, channel));
    const authored = EXPOSURES[String(recipe)];
    if (!authored) throw new TypeError('ExposureBloom recipe is not authored');
    this.#law = authored[String(channel)];
    if (!this.#law) throw new TypeError('ExposureBloom channel is not authored');
    this.#channel = String(channel);
  }

  onFrame({ frame, fps }) {
    const amount = this.#law({ frame, fps });
    this.unit.present = amount > 0;
    if (this.unit.presentation === 'rgba') {
      this.unit.opacity = 1;
      this.unit.paint = {
        ...this.unit.paint,
        fill: this.#channel === 'flash'
          ? `rgba(255,255,255,${amount})`
          : `rgba(0,0,0,${amount})`,
      };
      return;
    }
    this.unit.opacity = amount;
    this.unit.paint = {
      ...this.unit.paint,
      fill: this.#channel === 'flash' ? '#ffffff' : '#000000',
    };
  }
}

function requireExposureOwner(unit, channel) {
  const expected = channel === 'flash'
    ? 'unit.flash-photo.exposure-plate'
    : channel === 'grade'
      ? 'unit.flash-photo.grade-plate'
      : null;
  if (unit?.constructor?.kind !== expected) {
    throw new TypeError('ExposureBloom requires its semantic shutter plate');
  }
  return unit;
}

function exposure(points) {
  return Object.freeze({
    flash: timeFlashLaw(Object.freeze(points)),
  });
}

function frameExposure(points, durationFrames) {
  return Object.freeze({
    flash: frameFlashLaw(Object.freeze(points), durationFrames),
  });
}

function timeFlashLaw(points) {
  return ({ frame, fps }) => points.reduce((peak, point) => {
    const time = (frame / fps) * 1000;
    const elapsed = time - point;
    const active = Number(elapsed >= 0 && elapsed < FLASH_DURATION_MS);
    const value = active * FLASH_PEAK * (1 - clamp(elapsed / FLASH_DURATION_MS));
    return Math.max(peak, value);
  }, 0);
}

function frameFlashLaw(points, durationFrames) {
  return ({ frame }) => points.reduce((peak, point) => {
    const elapsed = frame - point;
    const active = Number(elapsed >= 0 && elapsed < durationFrames);
    const value = active * FLASH_PEAK * (1 - clamp(elapsed / durationFrames));
    return Math.max(peak, value);
  }, 0);
}

function fadeGrade(start, duration) {
  return ({ frame, fps }) => clamp((((frame / fps) * 1000) - start) / duration);
}
