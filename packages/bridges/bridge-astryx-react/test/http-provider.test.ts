import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { HTTP_NODE_TYPES, httpProvider, httpSeam } from "../src/http-provider.js";

const feature: FeatureT = {
  id: "users-api",
  capability: "http",
  tree: {
    type: "Http",
    props: { name: "UsersApi" },
    children: [
      {
        type: "Endpoint",
        props: { name: "getUsers", method: "GET", path: "/users", response: "string[]" },
      },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("http provider", () => {
  it("emits a .running client scaffold and a durable transforms stub", () => {
    const assets = httpProvider.generate(feature);
    expect(assets).toHaveLength(2);
    const scaffold = assets.find((a) => !a.durable);
    const stub = assets.find((a) => a.durable);
    expect(scaffold?.path).toBe("http/UsersApi.ts");
    expect(stub?.path).toBe("http/users-api.ts");
    expect(scaffold?.content).toContain("interface UsersApiTransforms");
    expect(scaffold?.content).toContain("const transforms: UsersApiTransforms = usersApiTransforms");
    expect(scaffold?.content).toContain('fetch("/users", { method: "GET" })');
    expect(stub?.content).toContain("getUsers(raw: unknown): string[]");
  });

  it("declares a spec-derived seam contract and vocabulary", () => {
    expect(httpSeam(feature).srcPath).toBe("http/users-api.ts");
    expect(HTTP_NODE_TYPES).toEqual(["Http", "Endpoint"]);
  });
});
