export const id = "unit.three.scene";
export const backend = "three";
export const description = "Three.js scene root";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "external",
  });
}
