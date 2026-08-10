const TEXT_TARGETS = new WeakMap();
const TRANSIT_TARGETS = new WeakMap();

export function registerTerminalTextTarget(unit, recipe) {
  TEXT_TARGETS.set(unit, Object.freeze({ recipe: String(recipe), role: 'message' }));
  return unit;
}

export function requireTerminalTextTarget(unit, behaviourName) {
  const target = TEXT_TARGETS.get(unit);
  if (!target) throw new TypeError(`${behaviourName} requires a terminal message target`);
  return unit;
}

export function terminalTextTarget(unit, behaviourName) {
  requireTerminalTextTarget(unit, behaviourName);
  return TEXT_TARGETS.get(unit);
}

export function registerTerminalTransitTarget(unit, recipe, role) {
  TRANSIT_TARGETS.set(unit, Object.freeze({
    recipe: String(recipe),
    role: String(role),
  }));
  return unit;
}

export function requireTerminalTransitTarget(unit, behaviourName) {
  const target = TRANSIT_TARGETS.get(unit);
  if (!target) throw new TypeError(`${behaviourName} requires a terminal transit target`);
  return unit;
}

export function terminalTransitTarget(unit, behaviourName) {
  requireTerminalTransitTarget(unit, behaviourName);
  return TRANSIT_TARGETS.get(unit);
}
