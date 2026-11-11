// Java enums in the port: every constant is a frozen object { name, ordinal } (Java e.name() -> e.name,
// e.ordinal() -> e.ordinal); compare constants by identity. X.values() returns the constants in declaration order.

export function javaEnum(names, extra) {
  const values = names.map((name, ordinal) => {
    const constant = { name, ordinal };
    if (extra) Object.assign(constant, extra(constant));
    return Object.freeze(constant);
  });
  const out = {};
  for (const v of values) out[v.name] = v;
  out.values = () => values.slice();
  out.valueOf = (name) => {
    const v = out[name];
    if (!v || typeof v !== 'object') throw new Error(`No enum constant ${name}`);
    return v;
  };
  return Object.freeze(out);
}
