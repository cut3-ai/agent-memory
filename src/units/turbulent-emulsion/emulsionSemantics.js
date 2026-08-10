const TARGETS = new WeakMap();

/** Bind one semantic owner to one closed turbulent-emulsion frame law. */
export function bindEmulsionTarget(owner, variant, role, index, laws) {
  const binding = Object.freeze({
    index: Number(index),
    laws: Object.freeze([...laws]),
    owner,
    role: String(role),
    variant: String(variant),
  });
  TARGETS.set(owner, binding);
  return Object.freeze({ index: binding.index, owner, role: binding.role });
}

/** Fail closed when a Behaviour is constructed for an unbound or wrong-law owner. */
export function requireEmulsionTarget(owner, law) {
  const binding = TARGETS.get(owner);
  if (!binding || !binding.laws.includes(String(law))) {
    throw new TypeError(`${law} requires an authored turbulent-emulsion target`);
  }
  return binding;
}
