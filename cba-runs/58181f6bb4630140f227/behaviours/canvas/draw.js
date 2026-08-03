export const id = "behaviour.canvas.draw";
export const channel = "canvas-draw";
export const description = "Canvas draw lifecycle";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
