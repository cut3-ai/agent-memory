import { Canvas } from '../../../../units/canvas.js';
import { compact, visualStyle } from '../style.js';

export function renderCanvas(context) {
  if (!(context.unit instanceof Canvas)) return context.unhandled;
  return context.React.createElement(context.component('canvas', 'canvas'), compact({
    height: context.state.height ?? undefined,
    style: visualStyle(context.state),
    width: context.state.width ?? undefined,
  }), ...context.renderChildren());
}
