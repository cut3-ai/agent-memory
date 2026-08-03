export const id = "unit.control.switch";
export const backend = "react";
export const description = "Choose child units from a control branch";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "fragment",
  });
}
