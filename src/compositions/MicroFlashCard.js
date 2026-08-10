import { FlashPulse } from '@cut3/agent-memory/behaviours/micro-flash/FlashPulse';
import { MicroFlashCard } from '@cut3/agent-memory/units/micro-flash/MicroFlashCard';

/** Plain application output for one runtime-colored seven-frame flash card. */
export function microFlashCard(color = '#ffffff', timing = 'last-rendered-frame') {
  const unit = new MicroFlashCard();
  const pulse = new FlashPulse(unit, color, timing);

  unit.addBehaviour(pulse);

  return unit;
}
