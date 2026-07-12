import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const ALLOWED = ["Card", "VStack", "Text"];

function spec(tree: SpecificationT["features"][number]["tree"]): SpecificationT {
  return {
    version: "1",
    features: [
      { id: "f1", capability: "component", tree, annotations: {}, props: {}, approved: true },
    ],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("checkExpressible (pre-barrier)", () => {
  it("passes when every node type is in the catalog", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Text" }] }), ALLOWED);
    expect(r).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 on an unknown component, recursively", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Blob" }] }), ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
  });
});
