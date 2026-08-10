import { AnalogScanBurst } from '@cut3/agent-memory/behaviours/crt-glitch/AnalogScanBurst';
import { CrtGlitchField } from '@cut3/agent-memory/units/crt-glitch/CrtGlitchField';

/** Plain application output for a full-frame seeded CRT film field. */
export function crtFilmField() {
  const unit = new CrtGlitchField('film-field');
  const target = unit.animationTargets().signal;
  const animation = new AnalogScanBurst(target.owner);

  target.owner.addBehaviour(animation);

  return unit;
}

/** Plain application output for runtime copy under the authored glitch signal. */
export function crtGlitchTitle(content) {
  const unit = new CrtGlitchField('glitch-title', content);
  const target = unit.animationTargets().signal;
  const animation = new AnalogScanBurst(target.owner);

  target.owner.addBehaviour(animation);

  return unit;
}
