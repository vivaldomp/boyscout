import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { plan, serializeGraph } from "../src/index.js";

function spec(ids: string[]): SpecificationT {
  return {
    version: "1",
    features: ids.map((id) => ({
      id,
      capability: "component",
      tree: { type: "Card" },
      annotations: {},
      props: {},
      approved: true,
    })),
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("plan", () => {
  it("emits one node per feature", () => {
    const g = plan(spec(["a", "b"]));
    expect(g.nodes).toEqual([
      { id: "a", capability: "component" },
      { id: "b", capability: "component" },
    ]);
  });

  it("orders nodes by byte-collation, not spec order", () => {
    const g = plan(spec(["b", "a"]));
    expect(g.ordering).toEqual(["a", "b"]);
  });

  it("serializes deterministically", () => {
    const a = serializeGraph(plan(spec(["b", "a"])));
    const b = serializeGraph(plan(spec(["a", "b"])));
    expect(a).toBe(b);
  });
});
