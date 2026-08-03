export const id = "behaviour.css.property";
export const channel = "property";
export const description = "CSS property";

export function create(runtime, { id: instanceId = id, read, setup, descriptor = {} }) {
  return runtime.behaviour({
    id: instanceId,
    read,
    setup,
    ...descriptor,
    channel,
  });
}
