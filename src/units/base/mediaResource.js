const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

/** Validate a host-owned resource identifier without parsing or rewriting it. */
export function mediaResource(value, name) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || CONTROL_CHARACTERS.test(value)
  ) {
    throw new TypeError(`${name} must be an opaque non-empty string without control characters`);
  }
  return value;
}
