export const id = "behaviour.dom.attribute";
export const channel = "attribute";
export const description = "DOM attribute";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
