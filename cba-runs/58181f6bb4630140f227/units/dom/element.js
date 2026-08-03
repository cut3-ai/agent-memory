export const id = "unit.dom.element";
export const backend = "dom";
export const description = "Generic DOM element";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "intrinsic",
  });
}
