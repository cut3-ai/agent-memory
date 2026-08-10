import { Unit } from '@cut3/agent-memory/core/Unit';
import { finite } from '@cut3/agent-memory/core/timeline';
import { mediaResource } from '@cut3/agent-memory/units/base/mediaResource';
import { visual } from '@cut3/agent-memory/units/base/visual';

export class Image extends Unit {
  static kind = 'unit.image';

  constructor(source, options = {}) {
    super();
    Object.assign(this, visual(options));
    this.fit = String(options.fit ?? 'cover');
    this.position = mediaPosition(options.position);
    this.decode = mediaDecode(options.decode);
    this.source = mediaResource(source, 'image.source');
  }
}

function mediaPosition(value = {}) {
  const x = finite(value.x ?? 0.5, 'image.position.x');
  const y = finite(value.y ?? 0.5, 'image.position.y');
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new RangeError('image.position must stay between zero and one');
  }
  return { x, y };
}

function mediaDecode(value = 'auto') {
  const decode = String(value);
  if (!['auto', 'async', 'sync'].includes(decode)) {
    throw new TypeError('image.decode must be auto, async, or sync');
  }
  return decode;
}
