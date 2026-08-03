export const id = "behaviour.three.property";
export const channel = "three-property";
export const description = "Three.js property or uniform";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
