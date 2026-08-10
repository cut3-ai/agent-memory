import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Image } from '@cut3/agent-memory/units/base/Image';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Runtime media owner carrying the complete authored beat-cut identity. */
export class BeatPhotoMedia extends Image {
  static kind = 'unit.photo-glitch.beat-media';

  constructor(source) {
    super(source);
    this.beatIndex = 0;
    this.beatLocalFrame = 0;
    this.beatVariant = 0;
  }
}

/** Image stage carrying a semantic two-colour alpha-shadow handoff. */
export class RgbGlitchStage extends Layer {
  static kind = 'unit.photo-glitch.rgb-stage';

  constructor(image) {
    requireUnit(image, 'RgbGlitchStage image');
    requireDetachedUnit(image, 'RgbGlitchStage image');
    if (image.constructor.kind !== 'unit.photo-glitch.beat-media') {
      throw new TypeError('RgbGlitchStage requires a BeatPhotoMedia Unit');
    }
    image.frame = { x: 0, y: 0, width: '100%', height: '100%', z: 1 };
    image.fit = 'cover';

    super(image, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 1 },
      name: 'rgb-glitch-stage',
    });
    this.glitchStrength = 0;
    this.mediaEpoch = 0;
    this.rgbGhosts = ghostState(0);
  }
}

export function ghostState(amount) {
  return [
    { x: -amount, y: 0, blur: 0, color: 'rgba(255,0,0,0.75)' },
    { x: amount, y: 0, blur: 0, color: 'rgba(0,200,255,0.75)' },
  ];
}
