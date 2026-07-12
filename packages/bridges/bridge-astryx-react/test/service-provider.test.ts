import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { SERVICE_NODE_TYPES, serviceProvider, serviceSeam } from "../src/service-provider.js";

const feature: FeatureT = {
  id: "user-service",
  capability: "service",
  tree: {
    type: "Service",
    props: { name: "UserService" },
    children: [{ type: "Method", props: { name: "getUsers", params: "", returns: "Promise<string[]>" } }],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("service provider", () => {
  it("emits a .running scaffold and a durable src stub", () => {
    const assets = serviceProvider.generate(feature);
    expect(assets).toHaveLength(2);
    const scaffold = assets.find((a) => !a.durable);
    const stub = assets.find((a) => a.durable);
    expect(scaffold?.path).toBe("services/UserService.ts");
    expect(stub?.path).toBe("services/user-service.ts");
    expect(scaffold?.content).toContain("interface UserServiceContract");
    expect(scaffold?.content).toContain('from "../../src/services/user-service.js"');
    expect(scaffold?.content).toContain("const userService: UserServiceContract = impl");
    expect(stub?.content).toContain("getUsers(): Promise<string[]>");
  });

  it("declares a spec-derived seam contract", () => {
    const seam = serviceSeam(feature);
    expect(seam.srcPath).toBe("services/user-service.ts");
    expect(seam.typedSignature).toBe("UserServiceContract");
  });

  it("exposes its node-type vocabulary", () => {
    expect(SERVICE_NODE_TYPES).toEqual(["Service", "Method"]);
  });
});
