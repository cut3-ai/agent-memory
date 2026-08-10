import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import {
  progress,
  requireMotion,
} from '@cut3/agent-memory/core/timeline';
import {
  impactCaptionTarget,
  requireImpactCaptionTarget,
} from '@cut3/agent-memory/units/kinetic-intertitles/ScanlineImpactCaption';

const ROLES = Object.freeze([
  'scanline-row',
  'scanline-letter',
  'spring-back-row',
  'spring-back-letter',
  'spring-front-row',
  'spring-front-letter',
]);
const FLICKER_PATTERNS = Object.freeze([
  Object.freeze([0.08, 0.72, 0.22, 0.88, 0.38, 1]),
  Object.freeze([0.18, 0.58, 0.82, 0.28, 0.68, 1]),
  Object.freeze([0.04, 0.78, 0.18, 0.72, 0.48, 1]),
  Object.freeze([0.28, 0.48, 0.92, 0.18, 0.62, 1]),
  Object.freeze([0.12, 0.38, 0.84, 0.32, 0.52, 1]),
  Object.freeze([0.22, 0.65, 0.35, 0.78, 0.42, 1]),
  Object.freeze([0.06, 0.82, 0.15, 0.68, 0.55, 1]),
]);

/** Complete impact-letter law: flicker/scanline glow or spring/breath shadow plate. */
export class ImpactLetterCadence extends Behaviour {
  static kind = 'behaviour.kinetic-intertitles.impact-letter-cadence';

  #count;
  #index;
  #role;

  constructor(unit) {
    super(requireImpactCaptionTarget(unit, ROLES, 'ImpactLetterCadence'));
    const target = impactCaptionTarget(unit, ROLES, 'ImpactLetterCadence');
    this.#role = target.role;
    this.#index = target.index;
    this.#count = target.count;
  }

  onFrame(context) {
    const { duration, fps, frame } = context;
    const fadeDuration = Math.round(fps * 0.5);
    const fade = 1 - progress(frame, duration - fadeDuration, fadeDuration);

    if (this.#role === 'scanline-row') {
      this.unit.opacity = fade;
      this.unit.effects = {
        ...this.unit.effects,
        brightness: 1 + (0.05 * Math.sin((frame * Math.PI * 2 * 8) / fps)),
      };
      return;
    }

    if (this.#role === 'scanline-letter') {
      const typingDuration = this.#count * 5;
      const localFrame = frame - (this.#index * 5);
      const glowTransition = progress(frame, typingDuration - 5, 25);
      const glowPulse = 1
        + (0.45 * Math.sin((frame - typingDuration) * 0.065) * glowTransition);
      const pattern = FLICKER_PATTERNS[this.#index % FLICKER_PATTERNS.length];
      let opacity = 1;
      if (localFrame < 0) opacity = 0;
      else if (localFrame < 6) opacity = pattern[Math.floor(localFrame)];

      this.unit.opacity = opacity;
      this.unit.typography = {
        ...this.unit.typography,
        shadows: [
          { x: 0, y: 0, blur: 18 * glowPulse, color: '#8888ff' },
          { x: 0, y: 0, blur: 36 * glowPulse, color: '#8888ff' },
          { x: 0, y: 0, blur: 54 * glowPulse, color: '#6666cc' },
          { x: 0, y: 0, blur: 80 * glowPulse, color: '#4444aa' },
        ],
      };
      return;
    }

    const letterCount = this.#role.endsWith('-row') ? this.unit.units.length : this.#count;
    const breathStart = ((letterCount - 1) * 4) + 12;
    const breathTime = Math.max(0, frame - breathStart);
    const breathEase = progress(breathTime, 0, 30);
    const breathScale = 1 + (Math.sin(breathTime * 0.04) * 0.03 * breathEase);

    if (this.#role === 'spring-back-row' || this.#role === 'spring-front-row') {
      const backing = this.#role === 'spring-back-row';
      this.unit.opacity = (backing ? 0.6 : 1) * fade;
      this.unit.pose = {
        ...this.unit.pose,
        operations: backing
          ? [
            { kind: 'scale-2d', x: breathScale, y: breathScale },
            { kind: 'translate-2d', x: 2, y: 3 },
          ]
          : [{ kind: 'scale-2d', x: breathScale, y: breathScale }],
        scaleX: 1,
        scaleY: 1,
        x: 0,
        y: 0,
      };
      return;
    }

    const spring = requireMotion(context, 'ImpactLetterCadence').spring({
      frame: frame - (this.#index * 4),
      fps,
      config: { damping: 8, stiffness: 120 },
    });
    const scale = this.#role === 'spring-front-letter' ? Math.max(0.01, spring) : spring;

    this.unit.opacity = spring;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [{ kind: 'scale-2d', x: scale, y: scale }],
      scaleX: 1,
      scaleY: 1,
      x: 0,
      y: 0,
    };
  }
}
