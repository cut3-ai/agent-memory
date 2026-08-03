export const id = "unit.react.fragment";
export const backend = "react";
export const description = "Fragment";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "fragment",
  });
}
