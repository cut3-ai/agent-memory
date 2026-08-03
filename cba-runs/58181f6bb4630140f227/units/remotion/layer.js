export const id = "unit.remotion.layer";
export const backend = "remotion";
export const description = "Full-frame layer";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "external",
  });
}
