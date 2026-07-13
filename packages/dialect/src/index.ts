import type { SpecificationT } from "@boyscout/schemas";
import { validateSpec } from "@boyscout/spec";
import { bind, type DialectRegistry } from "./bind.js";
import { parseOpenuiRaw } from "./parse.js";

export { DialectError } from "./parse.js";
export type { DialectRegistry } from "./bind.js";
export { serializeOpenui } from "./serialize.js";

/** `.openui` text -> bind -> validate (Zod + pre-barrier). Throws on any failure. */
export function parseOpenui(text: string, registry: DialectRegistry): SpecificationT {
  const spec = bind(parseOpenuiRaw(text), registry);
  const validated = validateSpec(spec, registry);
  if (!validated.ok) throw new Error(`invalid .openui spec: ${validated.violations.join("; ")}`);
  return validated.spec;
}
