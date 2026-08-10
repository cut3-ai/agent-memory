import { BeatPhotoCadence } from '@cut3/agent-memory/behaviours/photo-glitch/BeatPhotoCadence';
import { BeatExposureCadence } from '@cut3/agent-memory/behaviours/photo-glitch/BeatVignetteFlicker';
import { RgbBeatGlitch } from '@cut3/agent-memory/behaviours/photo-glitch/RgbBeatGlitch';
import { BeatGlitchPhoto } from '@cut3/agent-memory/units/photo-glitch/BeatGlitchPhoto';
import {
  BeatPhotoMedia,
  RgbGlitchStage,
} from '@cut3/agent-memory/units/photo-glitch/RgbGlitchStage';

/** Plain application output for a runtime image pool and the beat-glitch treatment. */
export function beatGlitchPhoto(sources) {
  const image = new BeatPhotoMedia(sources[0]);
  const stage = new RgbGlitchStage(image);
  const unit = new BeatGlitchPhoto(stage);
  const cadence = new BeatPhotoCadence(image, sources);
  const glitch = new RgbBeatGlitch(stage);
  const flicker = new BeatExposureCadence(unit.vignette);

  stage.addBehaviour(glitch);
  image.addBehaviour(cadence);
  unit.vignette.addBehaviour(flicker);

  return unit;
}
