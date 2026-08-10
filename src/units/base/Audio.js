import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite, positive } from '@cut3/agent-memory/core/timeline';
import { mediaResource } from '@cut3/agent-memory/units/base/mediaResource';

/** Renderer-neutral timeline audio. The source remains opaque runtime data. */
export class Audio extends Unit {
  static kind = 'unit.audio';

  constructor(source, options = {}) {
    super();
    this.source = mediaResource(source, 'audio.source');
    this.muted = options.muted === true;
    this.loop = options.loop === true;
    this.startFrom = nonNegative(options.startFrom ?? 0, 'audio.startFrom');
    this.endAt = options.endAt === undefined
      ? null
      : finite(options.endAt, 'audio.endAt');
    if (this.endAt !== null && this.endAt <= this.startFrom) {
      throw new RangeError('audio.endAt must be greater than audio.startFrom');
    }
    this.playbackRate = positive(options.playbackRate ?? 1, 'audio.playbackRate');
    this.volume = bounded(options.volume ?? 1, 'audio.volume');
  }
}

function nonNegative(value, name) {
  const amount = finite(value, name);
  if (amount < 0) throw new RangeError(`${name} must be non-negative`);
  return amount;
}

function bounded(value, name) {
  const amount = finite(value, name);
  if (amount < 0 || amount > 1) throw new RangeError(`${name} must stay between zero and one`);
  return amount;
}
