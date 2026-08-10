import { requireUnit } from '@cut3/agent-memory/core/Unit';
import { requireDetachedUnit } from '@cut3/agent-memory/core/ownership';
import { Box } from '@cut3/agent-memory/units/base/Box';
import { Layer } from '@cut3/agent-memory/units/base/Layer';

/** Authored radial edge exposure owned by the beat-glitch treatment. */
export class BeatExposureVignette extends Box {
  static kind = 'unit.photo-glitch.beat-exposure-vignette';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 3 },
      opacity: 0.6,
      paint: {
        backgrounds: [{
          kind: 'radial-gradient',
          shape: 'circle',
          position: { x: '50%', y: '50%' },
          stops: [
            { offset: 0.55, color: 'transparent' },
            { offset: 1, color: 'rgba(0,0,0,0.55)' },
          ],
        }],
      },
      name: 'beat-photo-vignette',
    });
    this.exposureCadence = Object.freeze({
      beatIndex: 0,
      beatLocalFrame: 0,
      level: 0.6,
      oscillation: 0,
    });
    this.exposureLevel = 0.6;
  }
}

/** Static three-pixel DOM/CSS scanline texture for the beat-cut treatment. */
class BeatScanlineField extends Box {
  static kind = 'unit.photo-glitch.beat-scanline-field';

  constructor() {
    super(undefined, {
      frame: { x: 0, y: 0, width: '100%', height: '100%', z: 2 },
      opacity: 0.5,
      effects: { blendMode: 'multiply' },
      paint: {
        backgrounds: [{
          angle: 0,
          kind: 'linear-gradient',
          repeating: true,
          stops: [
            { offset: 0, unit: 'px', color: 'rgba(0,0,0,0.18)' },
            { offset: 1, unit: 'px', color: 'rgba(0,0,0,0.18)' },
            { offset: 1, unit: 'px', color: 'transparent' },
            { offset: 3, unit: 'px', color: 'transparent' },
          ],
        }],
      },
      name: 'beat-photo-scanlines',
    });
  }
}

/** Beat-cut image stage with exact scanline and vignette overlays. */
export class BeatGlitchPhoto extends Layer {
  static kind = 'unit.photo-glitch.beat-photo';
  #vignette;

  constructor(stage) {
    requireUnit(stage, 'BeatGlitchPhoto stage');
    requireDetachedUnit(stage, 'BeatGlitchPhoto stage');
    if (stage.constructor.kind !== 'unit.photo-glitch.rgb-stage') {
      throw new TypeError('BeatGlitchPhoto requires an RgbGlitchStage');
    }
    const scanlines = new BeatScanlineField();
    const vignette = new BeatExposureVignette();

    super(stage, {
      frame: { x: 0, y: 0, width: '100%', height: '100%' },
      overflow: 'hidden',
      paint: { fill: '#000000' },
      name: 'beat-glitch-photo',
    });
    this.addUnit(scanlines);
    this.addUnit(vignette);
    this.#vignette = vignette;
  }

  get vignette() {
    return this.#vignette;
  }
}
