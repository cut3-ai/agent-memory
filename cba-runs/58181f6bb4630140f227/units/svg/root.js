export const id = "unit.svg.root";
export const backend = "svg";
export const description = "SVG root";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "intrinsic",
  });
}
