export const id = "unit.dom.text";
export const backend = "dom";
export const description = "Text-bearing DOM element";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "intrinsic",
  });
}
