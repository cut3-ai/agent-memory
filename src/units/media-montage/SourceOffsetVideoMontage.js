import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Ordered source-offset video Shots with a semantic first-clip reveal. */
export class SourceOffsetVideoMontage extends Layer {
  static kind = 'unit.media-montage.source-offset-video';

  constructor(shots) {
    if (!Array.isArray(shots) || shots.length === 0) {
      throw new TypeError('SourceOffsetVideoMontage requires Shot Units');
    }
    for (const [index, shot] of shots.entries()) {
      requireUnit(shot, `SourceOffsetVideoMontage shot ${index + 1}`);
      requireDetachedUnit(shot, `SourceOffsetVideoMontage shot ${index + 1}`);
      if (shot.constructor.kind !== 'unit.media-montage.premounted-shot') {
        throw new TypeError('SourceOffsetVideoMontage requires PremountedMediaShot Units');
      }
    }
    if (new Set(shots).size !== shots.length) {
      throw new TypeError('SourceOffsetVideoMontage requires distinct Shots');
    }

    super(shots[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: { fill: '#000000' },
      name: 'source-offset-video-montage',
    });
    for (const shot of shots.slice(1)) this.addUnit(shot);
  }
}
