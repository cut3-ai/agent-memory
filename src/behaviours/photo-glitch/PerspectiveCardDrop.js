import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';

const CARD_DROPS = Object.freeze([
  drop(0, -180, -120, -14, 18, -20, 0.92),
  drop(15, 200, -40, 12, -14, 22, 1),
  drop(30, -120, 180, 9, 20, 16, 0.96),
  drop(45, 150, 220, -10, -18, -18, 1.04),
]);

/** Complete two-spring 3D card drop and settle in authored transform order. */
export class PerspectiveCardDrop extends Behaviour {
  static kind = 'behaviour.photo-glitch.perspective-card-drop';

  #authored;

  constructor(unit, index) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.perspective-card', 'PerspectiveCardDrop'));
    if (!Number.isInteger(index) || !CARD_DROPS[index]) {
      throw new RangeError('PerspectiveCardDrop index must select an authored card');
    }
    this.#authored = CARD_DROPS[index];
  }

  onFrame({ fps, frame }) {
    const authored = this.#authored;
    const localFrame = frame - authored.delay;
    const drop = springValue({
      frame: localFrame,
      fps,
      config: { damping: 16, stiffness: 90, mass: 1.1 },
    });
    const settle = springValue({
      frame: localFrame,
      fps,
      config: { damping: 11, stiffness: 120, mass: 0.8 },
    });
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        {
          kind: 'translate',
          x: lerp(authored.x * 0.3, authored.x, settle),
          y: lerp(-1300, authored.y, drop),
          z: lerp(600, 0, drop),
        },
        { kind: 'rotate-x', degrees: lerp(authored.rotateX * 3, 0, drop) },
        { kind: 'rotate-y', degrees: lerp(authored.rotateY * 2.5, 0, settle) },
        { kind: 'rotate-z', degrees: lerp(authored.rotate * 4, authored.rotate, settle) },
        {
          kind: 'scale-2d',
          x: lerp(0.4, authored.scale, drop),
          y: lerp(0.4, authored.scale, drop),
        },
      ],
    };
    this.unit.opacity = progress(localFrame, 0, 6);
  }
}

function drop(delay, x, y, rotate, rotateX, rotateY, scale) {
  return Object.freeze({ delay, rotate, rotateX, rotateY, scale, x, y });
}
