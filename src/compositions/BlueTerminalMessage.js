import { TerminalMessageCadence } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalMessageCadence';
import { TerminalPanelBoot } from '@cut3/agent-memory/behaviours/blue-terminal/TerminalPanelBoot';
import { Text } from '@cut3/agent-memory/units/base/Text';
import { BlueTerminalMessagePanel } from '@cut3/agent-memory/units/blue-terminal/BlueTerminalMessagePanel';

/** Plain application output: runtime text, static Unit, explicitly ordered Behaviours. */
export function blueTerminalMessage(text) {
  const content = new Text(text);
  const unit = new BlueTerminalMessagePanel(content);
  const boot = new TerminalPanelBoot(unit);
  const cadence = new TerminalMessageCadence(content);

  unit.addBehaviour(boot);
  content.addBehaviour(cadence);

  return unit;
}
