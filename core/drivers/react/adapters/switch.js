import { Switch } from '../../../../units/switch.js';

export function renderSwitch(context) {
  if (!(context.unit instanceof Switch)) return context.unhandled;
  const selected = context.unit.selected(context.frame);
  return selected ? context.render(selected) : null;
}
