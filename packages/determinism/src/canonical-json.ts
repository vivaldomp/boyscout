import { byteCompare } from "./byte-order.js";

/** Deterministic JSON: byte-sorted keys, no whitespace, explicit type policy. */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return "null";

  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(v)) throw new Error(`canonicalJson: non-finite number (${String(v)})`);
    return JSON.stringify(v === 0 ? 0 : v); // collapse -0 -> 0
  }
  if (t === "bigint") throw new Error("canonicalJson: bigint is not serializable");

  if (Array.isArray(v)) {
    const parts = v.map((el) => {
      if (el === undefined) throw new Error("canonicalJson: undefined array element");
      return serialize(el);
    });
    return `[${parts.join(",")}]`;
  }

  if (t === "object") {
    const proto = Object.getPrototypeOf(v);
    if (proto !== null && proto !== Object.prototype) {
      throw new Error(
        `canonicalJson: unsupported non-plain object (${(v as object).constructor?.name ?? "unknown"})`,
      );
    }

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(byteCompare);
    const parts = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`);
    return `{${parts.join(",")}}`;
  }

  throw new Error(`canonicalJson: unsupported type (${t})`);
}
