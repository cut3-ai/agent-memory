import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import {
  easeOut,
  lerp,
  progress,
  springValue,
} from '@cut3/agent-memory/core/timeline';

const BEAT_FRAMES = 22.3;
const cubic = (value) => value ** 3;

/** Runtime source cadence and four authored motion recipes for the beat image. */
export class BeatPhotoCadence extends Behaviour {
  static kind = 'behaviour.photo-glitch.beat-photo-cadence';

  #sources;

  constructor(unit, sources) {
    super(requireOwnerKind(unit, 'unit.photo-glitch.beat-media', 'BeatPhotoCadence'));
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new TypeError('BeatPhotoCadence requires runtime image sources');
    }
    this.#sources = Object.freeze(sources.map((source) => String(source)));
  }

  onFrame({ fps, frame }) {
    const index = Math.floor(frame / BEAT_FRAMES);
    const localFrame = frame - (index * BEAT_FRAMES);
    const variant = index % 4;
    const snap = springValue({
      frame: localFrame,
      fps,
      config: { damping: 14, stiffness: 200, mass: 0.7 },
    });
    let x = 0;
    let y = 0;
    let scale = 1;
    let rotate = 0;

    if (variant === 0) {
      scale = lerp(1.5, 1, easeOut(cubic)(progress(localFrame, 0, 6)));
    } else if (variant === 1) {
      const direction = index % 8 === 1 ? -1 : 1;
      x = lerp(direction * 1080, 0, snap);
      scale = lerp(1.08, 1, progress(localFrame, 0, 8));
    } else if (variant === 2) {
      rotate = lerp(15, 0, snap);
      scale = lerp(1.4, 1, snap);
    } else {
      y = lerp(1920, 0, snap);
      scale = lerp(1.08, 1, progress(localFrame, 0, 8));
    }

    this.unit.source = this.#sources[index % this.#sources.length];
    this.unit.beatIndex = index;
    this.unit.beatLocalFrame = localFrame;
    this.unit.beatVariant = variant;
    this.unit.pose = {
      ...this.unit.pose,
      operations: [
        { kind: 'translate-2d', x, y },
        { kind: 'scale-2d', x: scale, y: scale },
        { kind: 'rotate-z', degrees: rotate },
      ],
      origin: { x: '50%', y: '50%', z: 0 },
    };
    this.unit.opacity = 1;
  }
}
