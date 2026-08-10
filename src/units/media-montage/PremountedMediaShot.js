import { Shot } from '@cut3/agent-memory/units/base/Shot';

const BACKENDS = Object.freeze(['video', 'offthread-video']);

/** Sequence-compatible semantic handoff for backend and premount requirements. */
export class PremountedMediaShot extends Shot {
  static kind = 'unit.media-montage.premounted-shot';

  constructor(unit, options = {}) {
    super(unit, options);
    this.mediaBackend = options.mediaBackend ?? 'offthread-video';
    if (!BACKENDS.includes(this.mediaBackend)) {
      throw new TypeError('media shot backend is not supported');
    }
    if (options.pauseWhenBuffering !== undefined
      && typeof options.pauseWhenBuffering !== 'boolean') {
      throw new TypeError('media shot pauseWhenBuffering must be a boolean');
    }
    this.pauseWhenBuffering = options.pauseWhenBuffering ?? false;
  }
}
