export const id = "unit.media.video";
export const backend = "media";
export const description = "Video";

export function create(runtime, { type, props = {}, children = [] }) {
  return runtime.makeUnit(type, props, children, {
    factoryId: id,
    backend,
    componentKind: "external",
  });
}
