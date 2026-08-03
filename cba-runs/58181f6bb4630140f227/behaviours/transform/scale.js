export const id = "behaviour.transform.scale";
export const channel = "scale";
export const description = "Scale";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
