import { ImpactLetterCadence } from '@cut3/agent-memory/behaviours/kinetic-intertitles/ImpactLetterCadence';
import { ImpactScanlineSweep } from '@cut3/agent-memory/behaviours/kinetic-intertitles/ImpactScanlineSweep';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { ScanlineImpactCaption } from '@cut3/agent-memory/units/kinetic-intertitles/ScanlineImpactCaption';

/** Plain application output for runtime impact letters and one complete CRT trace. */
export function scanlineImpactCaption(text, variant) {
  const letters = text.split('').map((letter) => new Text(letter));
  const unit = new ScanlineImpactCaption(letters, variant);
  const targets = unit.animationTargets();
  const cadences = targets.cadence.map(
    (target) => new ImpactLetterCadence(target.owner),
  );
  const sweep = new ImpactScanlineSweep(targets.scanline.owner);

  targets.cadence.forEach((target, index) => target.owner.addBehaviour(cadences[index]));
  targets.scanline.owner.addBehaviour(sweep);

  return unit;
}
