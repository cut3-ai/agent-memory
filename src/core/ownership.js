export function requireOwnerKind(unit, expected, behaviourName) {
  if (unit?.constructor?.kind !== expected) {
    throw new TypeError(`${behaviourName} requires ${expected}`);
  }
  return unit;
}

export function requireDetachedUnit(unit, name) {
  if (unit?.parent) throw new TypeError(`${name} must not already have a parent`);
  return unit;
}
