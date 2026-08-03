export const id = "unit.remotion.timeline-slot";
export const backend = "remotion";
export const description = "Timeline slot";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "external",
  });
}
