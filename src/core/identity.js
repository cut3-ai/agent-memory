const units = new WeakSet();
const behaviours = new WeakSet();

export function registerUnit(value) {
  units.add(value);
}

export function registerBehaviour(value) {
  behaviours.add(value);
}

export function isUnit(value) {
  return Boolean(value) && units.has(value);
}

export function isBehaviour(value) {
  return Boolean(value) && behaviours.has(value);
}

export function requireUnit(value, name = 'unit') {
  if (!isUnit(value)) throw new TypeError(`${name} must be a Unit`);
  return value;
}

export function requireKind(value, prefix) {
  const kind = value?.constructor?.kind;
  if (typeof kind !== 'string' || !kind.startsWith(`${prefix}.`) || kind === `${prefix}.base`) {
    throw new TypeError(`${value?.constructor?.name ?? 'Class'} requires a concrete static kind`);
  }
  return kind;
}
