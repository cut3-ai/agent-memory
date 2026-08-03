export const id = "unit.control.repeat";
export const backend = "react";
export const description = "Repeat any number of child units";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "fragment",
  });
}
