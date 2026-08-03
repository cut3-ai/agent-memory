export const id = "unit.canvas.surface";
export const backend = "canvas";
export const description = "Canvas surface";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "intrinsic",
  });
}
