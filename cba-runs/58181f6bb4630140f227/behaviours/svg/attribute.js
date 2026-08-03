export const id = "behaviour.svg.attribute";
export const channel = "svg-attribute";
export const description = "SVG attribute";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
