export const id = "behaviour.css.opacity";
export const channel = "opacity";
export const description = "Opacity";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
