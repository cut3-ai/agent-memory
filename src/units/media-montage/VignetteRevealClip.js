import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Semantic radial aperture plate for the first source-offset clip. */
export class FirstClipVignette extends Box {
  static kind = 'unit.media-montage.first-clip-vignette';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 3 },
      paint: {
        backgrounds: [{
          kind: 'radial-gradient',
          shape: 'circle',
          position: { x: '50%', y: '50%' },
          stops: [
            { offset: 0.06, color: 'transparent' },
            { offset: 1, color: 'rgba(0,0,0,0.92)' },
          ],
        }],
      },
      name: 'first-clip-vignette',
    });
  }
}

/** Semantic black shutter plate carrying the authored stutter reveal. */
export class FirstClipBlackStutter extends Box {
  static kind = 'unit.media-montage.first-clip-black-stutter';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 4 },
      opacity: 1,
      paint: { fill: '#000000' },
      name: 'first-clip-black-stutter',
    });
  }
}

/** First runtime Video with independent typed vignette and black stutter plates. */
export class VignetteRevealClip extends Layer {
  static kind = 'unit.media-montage.vignette-reveal-clip';
  #blackStutter;
  #vignette;

  constructor(video) {
    requireKind(video, 'unit.video', 'VignetteRevealClip video');
    video.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };
    video.fit = 'cover';
    const vignette = new FirstClipVignette();
    const blackStutter = new FirstClipBlackStutter();

    super(video, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      name: 'vignette-reveal-clip',
    });
    this.addUnit(vignette);
    this.addUnit(blackStutter);
    this.#vignette = vignette;
    this.#blackStutter = blackStutter;
  }

  get blackStutter() {
    return this.#blackStutter;
  }

  get vignette() {
    return this.#vignette;
  }
}

function requireKind(unit, expected, name) {
  requireUnit(unit, name);
  requireDetachedUnit(unit, name);
  if (unit.constructor.kind !== expected) throw new TypeError(`${name} requires ${expected}`);
}
