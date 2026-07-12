import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const reg = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (c: string) =>
    ({
      component: ["Card"],
      service: ["Service", "Method"],
      store: ["Store", "Action"],
      http: ["Http", "Endpoint"],
    })[c] ?? [],
};

const spec = (capability: string, tree: unknown): SpecificationT =>
  ({
    version: "1",
    features: [{ id: "f", capability, tree, annotations: {}, props: {}, approved: true }],
    metadata: { bridge: "b", platform: "p", checksum: "" },
  }) as SpecificationT;

describe("checkExpressible zero-child logic-bearing guard", () => {
  it("rejects a service with no Method children", () => {
    const r = checkExpressible(spec("service", { type: "Service", props: { name: "S" } }), reg);
    expect(r.ok).toBe(false);
    expect(r.violations.join()).toMatch(/no Method children/);
  });
  it("accepts a service with a Method child", () => {
    const r = checkExpressible(
      spec("service", { type: "Service", props: { name: "S" }, children: [{ type: "Method" }] }),
      reg,
    );
    expect(r.ok).toBe(true);
  });
});
