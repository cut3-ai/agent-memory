import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Semantic white exposure plate coupled to a flash-cut segment. */
export class CutFlashPlate extends Box {
  static kind = 'unit.media-montage.cut-flash-plate';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 4 },
      opacity: 0.35,
      paint: { fill: '#ffffff' },
      name: 'montage-cut-flash',
    });
  }
}

/** One detached runtime Video and its authored white cut-flash plate. */
export class FlashCutSegment extends Layer {
  static kind = 'unit.media-montage.flash-cut-segment';
  #flashPlate;

  constructor(video) {
    requireKind(video, 'unit.video', 'FlashCutSegment video');
    video.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };
    video.fit = 'cover';
    const flashPlate = new CutFlashPlate();

    super(video, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      name: 'flash-cut-segment',
    });
    this.addUnit(flashPlate);
    this.#flashPlate = flashPlate;
  }

  get flashPlate() {
    return this.#flashPlate;
  }
}

function requireKind(unit, expected, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== expected) throw new TypeError(`${name} requires ${expected}`);
}
