export const id = "unit.svg.element";
export const backend = "svg";
export const description = "SVG element";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "intrinsic",
  });
}
