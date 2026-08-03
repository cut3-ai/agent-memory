export const id = "unit.react.local-component";
export const backend = "react";
export const description = "Locally declared component";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "local",
  });
}
