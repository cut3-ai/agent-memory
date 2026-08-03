export const id = "behaviour.transform.rotate";
export const channel = "rotate";
export const description = "Rotation";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
