import { ThreeScene } from '../../../../units/three/scene.js';

/** The heavy Three component is supplied only by an app that imports it. */
export function renderThreeScene(context) {
  if (!(context.unit instanceof ThreeScene)) return context.unhandled;
  const Component = context.component('threeScene', null);
  if (Component === null) {
    throw new TypeError('ThreeScene requires an explicitly imported React Three component');
  }
  return context.React.createElement(Component, {
    frame: context.frame,
    state: context.state,
  }, ...context.renderChildren());
}
