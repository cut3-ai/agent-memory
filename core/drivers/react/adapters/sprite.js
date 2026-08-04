import { Sprite } from '../../../../units/sprite.js';
import { positionPercent, visualStyle } from '../style.js';

export function renderSprite(context) {
  if (!(context.unit instanceof Sprite)) return context.unhandled;
  const column = context.state.index % context.state.columns;
  const row = Math.floor(context.state.index / context.state.columns) % context.state.rows;
  return context.React.createElement(context.component('sprite', 'div'), {
    style: visualStyle(context.state, {
      backgroundImage: `url(${context.state.source})`,
      backgroundPosition: `${positionPercent(column, context.state.columns)}% ${positionPercent(row, context.state.rows)}%`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${100 * context.state.columns}% ${100 * context.state.rows}%`,
    }),
  });
}
