export function requireConcreteKind(value, prefix) {
  const Constructor = value?.constructor;
  const descriptor = Object.getOwnPropertyDescriptor(Constructor ?? {}, 'kind');
  const kind = descriptor?.value;
  if (typeof kind !== 'string'
      || !kind.startsWith(`${prefix}.`)
      || kind.length === prefix.length + 1) {
    throw new TypeError(`${Constructor?.name ?? prefix} requires its own static kind`);
  }
  return kind;
}
