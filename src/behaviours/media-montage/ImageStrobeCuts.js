import { Behaviour } from '@cut3/agent-memory/core/Behaviour';
import { requireOwnerKind } from '@cut3/agent-memory/core/ownership';
import { finite } from '@cut3/agent-memory/core/timeline';

/** Deterministic source-slot strobe using the authored millisecond cut cadence. */
export class ImageStrobeCuts extends Behaviour {
  static kind = 'behaviour.media-montage.image-strobe-cuts';

  #cutMilliseconds;
  #sources;

  constructor(unit, sources, cutMilliseconds) {
    super(requireOwnerKind(unit, 'unit.image', 'ImageStrobeCuts'));
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new TypeError('ImageStrobeCuts requires runtime sources');
    }
    this.#sources = Object.freeze(sources.map((source) => String(source)));
    this.#cutMilliseconds = finite(cutMilliseconds, 'ImageStrobeCuts cut milliseconds');
    if (this.#cutMilliseconds <= 0) {
      throw new RangeError('ImageStrobeCuts cut milliseconds must be positive');
    }
  }

  onFrame({ fps, frame }) {
    const cutFrames = Math.max(1, Math.round((this.#cutMilliseconds / 1000) * fps));
    const index = Math.floor(frame / cutFrames) % this.#sources.length;
    this.unit.source = this.#sources[index];
    this.unit.opacity = 1;
    this.unit.pose = { ...this.unit.pose, scaleX: 1, scaleY: 1, x: 0, y: 0 };
  }
}
