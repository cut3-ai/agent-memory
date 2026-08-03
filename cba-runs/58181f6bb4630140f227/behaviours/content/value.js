export const id = "behaviour.content.value";
export const channel = "content";
export const description = "Frame-driven rendered content";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
