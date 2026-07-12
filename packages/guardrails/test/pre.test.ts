import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const registry = {
  capabilities: ["component"],
  nodeTypesFor: (c: string): readonly string[] => (c === "component" ? ["Card", "VStack", "Text"] : []),
};

function spec(tree: SpecificationT["features"][number]["tree"], capability = "component"): SpecificationT {
  return {
    version: "1",
    features: [{ id: "f1", capability, tree, annotations: {}, props: {}, approved: true }],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("checkExpressible (pre-barrier)", () => {
  it("passes when every node type is in the capability's vocabulary", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Text" }] }), registry);
    expect(r).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 on an unknown node type, recursively", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Blob" }] }), registry);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
  });

  it("fails with 422 on an unknown capability", () => {
    const r = checkExpressible(spec({ type: "Card" }, "service"), registry);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("service"))).toBe(true);
  });
});
