const encoder = new TextEncoder();

/** Compare two strings by their UTF-8 byte sequence (== Unicode code-point order). Never locale-aware. */
export function byteCompare(a: string, b: string): -1 | 0 | 1 {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = ba[i]!;
    const y = bb[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (ba.length === bb.length) return 0;
  return ba.length < bb.length ? -1 : 1;
}

/** Stable sort of a copy of `items` by `byteCompare` of each item's string key. */
export function sortByBytes<T>(items: readonly T[], keyFn: (t: T) => string): T[] {
  return [...items].sort((x, y) => byteCompare(keyFn(x), keyFn(y)));
}
