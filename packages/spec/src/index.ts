import { checkExpressible } from "@boyscout/guardrails";
import {
  Specification,
  type BridgeRegistry,
  type GuardrailResultT,
  type SpecificationT,
} from "@boyscout/schemas";

export type ValidateResult =
  | { ok: true; spec: SpecificationT }
  | (GuardrailResultT & { ok: false });

/** The 422 gate: Zod shape-validation, then the capability-scoped pre-barrier. Never emits. */
export function validateSpec(
  input: unknown,
  registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">,
): ValidateResult {
  const parsed = Specification.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
      code: 422,
    };
  }
  const gate = checkExpressible(parsed.data, registry);
  if (!gate.ok) return gate as GuardrailResultT & { ok: false };
  return { ok: true, spec: parsed.data };
}
