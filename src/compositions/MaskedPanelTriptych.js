import { MaskedPanelSpringReveal } from '@cut3/agent-memory/behaviours/photo-glitch/MaskedPanelSpringReveal';
import { PanelKenBurnsDrift } from '@cut3/agent-memory/behaviours/photo-glitch/PanelKenBurnsDrift';
import { TriptychSceneCadence } from '@cut3/agent-memory/behaviours/photo-glitch/TriptychExitFade';
import { MaskedPanelTriptych } from '@cut3/agent-memory/units/photo-glitch/MaskedPanelTriptych';
import { MaskedPanelMedia } from '@cut3/agent-memory/units/photo-glitch/MaskedPhotoPanel';

/** Plain application output for three runtime images and the masked panel treatment. */
export function maskedPanelTriptych(sources) {
  const images = sources.map((source, index) => new MaskedPanelMedia(source, index));
  const unit = new MaskedPanelTriptych(images);
  const targets = unit.animationTargets();
  const exit = new TriptychSceneCadence(unit);
  const reveals = targets.map(({ index, panel }) => new MaskedPanelSpringReveal(panel, index));
  const drifts = targets.map(({ image, index }) => new PanelKenBurnsDrift(image, index));

  unit.addBehaviour(exit);
  targets.forEach(({ panel }, index) => panel.addBehaviour(reveals[index]));
  targets.forEach(({ image }, index) => image.addBehaviour(drifts[index]));

  return unit;
}
