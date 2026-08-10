import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Static alpha vignette shared by all authored flash-cut segments. */
export class FlashCutVignette extends Box {
  static kind = 'unit.media-montage.flash-cut-vignette';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 20 },
      paint: {
        backgrounds: [{
          kind: 'radial-gradient',
          shape: 'ellipse',
          position: { x: '50%', y: '50%' },
          stops: [
            { offset: 0.4, color: 'transparent' },
            { offset: 1, color: 'rgba(0,0,0,0.45)' },
          ],
        }],
      },
      name: 'flash-cut-vignette',
    });
  }
}

/** Ordered flash-cut Shots under one static renderer-neutral vignette. */
export class FlashCutVideoMontage extends Layer {
  static kind = 'unit.media-montage.flash-cut-video';
  #vignette;

  constructor(shots) {
    requireShots(shots, 'FlashCutVideoMontage');
    const vignette = new FlashCutVignette();

    super(shots[0], {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: { fill: '#000000' },
      name: 'flash-cut-video-montage',
    });
    for (const shot of shots.slice(1)) this.addUnit(shot);
    this.addUnit(vignette);
    this.#vignette = vignette;
  }

  get vignette() {
    return this.#vignette;
  }
}

function requireShots(shots, name) {
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new TypeError(`${name} requires Shot Units`);
  }
  for (const [index, shot] of shots.entries()) {
    requireUnit(shot, `${name} shot ${index + 1}`);
    requireDetachedUnit(shot, `${name} shot ${index + 1}`);
    if (shot.constructor.kind !== 'unit.media-montage.premounted-shot') {
      throw new TypeError(`${name} requires PremountedMediaShot Units`);
    }
  }
  if (new Set(shots).size !== shots.length) throw new TypeError(`${name} requires distinct Shots`);
}
