import { DialogueCard } from '../../../../units/dialogue-card.js';
import { visualStyle } from '../style.js';

export function renderDialogueCard(context) {
  if (!(context.unit instanceof DialogueCard)) return context.unhandled;
  return context.React.createElement(context.component('dialogueCard', 'div'), {
    style: visualStyle(context.state),
  }, ...context.renderChildren());
}
