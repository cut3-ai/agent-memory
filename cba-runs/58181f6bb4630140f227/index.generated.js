// Navigation index only: every factory stays behind a dynamic import for tree-shaking.
export const unitLoaders = Object.freeze({
  "unit.canvas.surface": () => import("./units/canvas/surface.js"),
  "unit.control.repeat": () => import("./units/control/repeat.js"),
  "unit.control.switch": () => import("./units/control/switch.js"),
  "unit.dom.element": () => import("./units/dom/element.js"),
  "unit.dom.text": () => import("./units/dom/text.js"),
  "unit.media.audio": () => import("./units/media/audio.js"),
  "unit.media.image": () => import("./units/media/image.js"),
  "unit.media.video": () => import("./units/media/video.js"),
  "unit.react.fragment": () => import("./units/react/fragment.js"),
  "unit.react.local-component": () => import("./units/react/local-component.js"),
  "unit.remotion.layer": () => import("./units/remotion/layer.js"),
  "unit.remotion.timeline-slot": () => import("./units/remotion/timeline-slot.js"),
  "unit.svg.element": () => import("./units/svg/element.js"),
  "unit.svg.root": () => import("./units/svg/root.js"),
  "unit.three.element": () => import("./units/three/element.js"),
  "unit.three.scene": () => import("./units/three/scene.js"),
});

export const behaviourLoaders = Object.freeze({
  "behaviour.canvas.draw": () => import("./behaviours/canvas/draw.js"),
  "behaviour.content.value": () => import("./behaviours/content/value.js"),
  "behaviour.css.opacity": () => import("./behaviours/css/opacity.js"),
  "behaviour.css.property": () => import("./behaviours/css/property.js"),
  "behaviour.dom.attribute": () => import("./behaviours/dom/attribute.js"),
  "behaviour.svg.attribute": () => import("./behaviours/svg/attribute.js"),
  "behaviour.three.effect": () => import("./behaviours/three/effect.js"),
  "behaviour.three.property": () => import("./behaviours/three/property.js"),
  "behaviour.transform.rotate": () => import("./behaviours/transform/rotate.js"),
  "behaviour.transform.scale": () => import("./behaviours/transform/scale.js"),
  "behaviour.transform.translate": () => import("./behaviours/transform/translate.js"),
});

export async function loadFactory(id) {
  const load = unitLoaders[id] ?? behaviourLoaders[id];
  if (!load) throw new Error(`Unknown CBA factory: ${id}`);
  return load();
}
