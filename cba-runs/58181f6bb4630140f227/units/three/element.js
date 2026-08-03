export const id = "unit.three.element";
export const backend = "three";
export const description = "Three.js scene element";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "external",
  });
}
