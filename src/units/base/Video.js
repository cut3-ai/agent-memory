import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite } from '@cut3/agent-memory/core/timeline';
import { visual } from '@cut3/agent-memory/units/base/visual';

export class Video extends Unit {
  static kind = 'unit.video';

  constructor(source, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.fit = String(options.fit ?? 'cover');
    this.muted = options.muted !== false;
    this.source = String(source ?? '');
    const startFrom = finite(options.startFrom ?? 0, 'video.startFrom');
    if (startFrom < 0) throw new RangeError('video.startFrom must be non-negative');
    this.startFrom = startFrom;
  }
}
