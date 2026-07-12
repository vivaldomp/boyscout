import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/index.js";

const ALLOWED = ["Card", "Text"];

const good = {
  version: "1",
  features: [
    { id: "f1", capability: "component", tree: { type: "Card", children: [{ type: "Text" }] },
      annotations: {}, props: {}, approved: true },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

describe("validateSpec", () => {
  it("returns the parsed spec when shape and catalog are valid", () => {
    const r = validateSpec(good, ALLOWED);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.features[0]?.id).toBe("f1");
  });

  it("returns 422 when the shape is malformed", () => {
    const r = validateSpec({ version: 1 }, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(422);
  });

  it("returns 422 when a component is outside the catalog (pre-barrier)", () => {
    const bad = structuredClone(good);
    const feature = bad.features[0];
    if (!feature) throw new Error("fixture");
    feature.tree.children = [{ type: "Blob" }];
    const r = validateSpec(bad, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
      expect(r.code).toBe(422);
    }
  });
});
