import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite, positive } from '@cut3/agent-memory/core/timeline';
import { mediaResource } from '@cut3/agent-memory/units/base/mediaResource';
import { visual } from '@cut3/agent-memory/units/base/visual';

const BACKENDS = Object.freeze(['auto', 'video', 'offthread-video']);

export class Video extends Unit {
  static kind = 'unit.video';

  constructor(source, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.backend = String(options.backend ?? 'auto');
    if (!BACKENDS.includes(this.backend)) {
      throw new TypeError('video.backend must be auto, video, or offthread-video');
    }
    this.fit = String(options.fit ?? 'cover');
    this.position = mediaPosition(options.position);
    this.muted = options.muted !== false;
    this.loop = options.loop === true;
    this.source = mediaResource(source, 'video.source');
    const startFrom = finite(options.startFrom ?? 0, 'video.startFrom');
    if (startFrom < 0) throw new RangeError('video.startFrom must be non-negative');
    this.startFrom = startFrom;
    const endAt = options.endAt === undefined
      ? null
      : finite(options.endAt, 'video.endAt');
    if (endAt !== null && endAt <= startFrom) {
      throw new RangeError('video.endAt must be greater than video.startFrom');
    }
    this.endAt = endAt;
    this.playbackRate = positive(options.playbackRate ?? 1, 'video.playbackRate');
    this.pauseWhenBuffering = options.pauseWhenBuffering === true;
    if (options.transparent !== undefined && typeof options.transparent !== 'boolean') {
      throw new TypeError('video.transparent must be a boolean');
    }
    this.transparent = options.transparent ?? false;
    if (this.transparent && this.backend === 'video') {
      throw new TypeError('video.transparent requires an offthread-video backend');
    }
    this.volume = volume(options.volume ?? 1, 'video.volume');
  }

  validateProjection() {
    if (typeof this.transparent !== 'boolean') {
      throw new TypeError('video.transparent must be a boolean');
    }
    if (this.transparent && this.backend === 'video') {
      throw new TypeError('video.transparent requires an offthread-video backend');
    }
  }
}

function mediaPosition(value = {}) {
  const x = finite(value.x ?? 0.5, 'video.position.x');
  const y = finite(value.y ?? 0.5, 'video.position.y');
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new RangeError('video.position must stay between zero and one');
  }
  return { x, y };
}

function volume(value, name) {
  const amount = finite(value, name);
  if (amount < 0 || amount > 1) throw new RangeError(`${name} must stay between zero and one`);
  return amount;
}
