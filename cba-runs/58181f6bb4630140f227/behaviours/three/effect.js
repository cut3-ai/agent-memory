export const id = "behaviour.three.effect";
export const channel = "three-effect";
export const description = "Three.js frame mutation lifecycle";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
