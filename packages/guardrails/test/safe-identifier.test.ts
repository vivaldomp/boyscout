import type { BridgeRegistry, SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const reg: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor"> = {
  capabilities: ["service"],
  nodeTypesFor: (c) => (c === "service" ? ["Service", "Method"] : []),
};

function specWithService(serviceName: string, methodName: string): SpecificationT {
  return {
    version: "1",
    features: [
      {
        id: "svc",
        capability: "service",
        tree: {
          type: "Service",
          props: { name: serviceName },
          children: [{ type: "Method", props: { name: methodName, params: "", returns: "void" } }],
        },
        annotations: {},
        props: {},
        approved: true,
      },
    ],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("safe-identifier pre-barrier", () => {
  it("accepts clean identifiers", () => {
    expect(checkExpressible(specWithService("UserService", "getUser"), reg).ok).toBe(true);
  });

  it("rejects a root name that is not a safe identifier", () => {
    const r = checkExpressible(specWithService("Bad Name", "getUser"), reg);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(
      r.violations.some((v) => v.includes("unsafe identifier") && v.includes("Bad Name")),
    ).toBe(true);
  });

  it("rejects a path-traversal name outright", () => {
    const r = checkExpressible(specWithService("../evil", "getUser"), reg);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes("../evil"))).toBe(true);
  });

  it("rejects an unsafe child (Method) name", () => {
    const r = checkExpressible(specWithService("UserService", 'x"; drop'), reg);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes("unsafe identifier"))).toBe(true);
  });
});
