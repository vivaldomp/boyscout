import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { camel } from "../src/naming.js";
import { httpProvider, httpSeam } from "../src/http-provider.js";

const feature: FeatureT = {
  id: "users-api",
  capability: "http",
  tree: {
    type: "Http",
    props: { name: "UsersApi" },
    children: [
      { type: "Endpoint", props: { name: "getUsers", method: "GET", path: "/users", response: "string[]" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("httpProvider", () => {
  it("emits a disposable service scaffold + a durable transforms stub", () => {
    const assets = httpProvider.generate(feature);
    expect(assets).toHaveLength(2);
    const scaffold = assets.find((a) => !a.durable);
    const stub = assets.find((a) => a.durable);
    expect(scaffold?.path).toBe("http/UsersApi.service.ts");
    expect(stub?.path).toBe("http/users-api.transforms.ts");
  });

  it("scaffold binds the typed transforms contract; stub throws", () => {
    const assets = httpProvider.generate(feature);
    const scaffold = assets.find((a) => !a.durable)?.content ?? "";
    const stub = assets.find((a) => a.durable)?.content ?? "";
    expect(scaffold).toContain("export interface UsersApiTransforms");
    expect(scaffold).toContain("getUsers(raw: unknown): string[]");
    expect(scaffold).toContain("const transforms: UsersApiTransforms = usersApiTransforms");
    expect(scaffold).toContain('this.http.request<unknown>("GET", "/users")');
    expect(scaffold).toContain('from "../../src/http/users-api.transforms.js"');
    expect(stub).toContain("export const usersApiTransforms");
    expect(stub).toContain('throw new Error("not implemented: getUsers transform")');
  });

  it("httpSeam describes the durable contract", () => {
    expect(httpSeam(feature)).toEqual({
      srcPath: "http/users-api.transforms.ts",
      typedSignature: "UsersApiTransforms",
      binding: "response transforms",
    });
  });

  it("sanitizes untrusted endpoint name into a safe identifier, consistently, across interface/service/stub", () => {
    const injected: FeatureT = {
      id: "evil-api",
      capability: "http",
      tree: {
        type: "Http",
        props: { name: "EvilApi" },
        children: [
          {
            type: "Endpoint",
            props: { name: "x(){}; evil", method: "GET", path: "/evil", response: "string" },
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const safe = camel("x(){}; evil");
    expect(safe).not.toBe("x(){}; evil");

    const assets = httpProvider.generate(injected);
    const scaffold = assets.find((a) => !a.durable)?.content ?? "";
    const stub = assets.find((a) => a.durable)?.content ?? "";

    // raw payload never appears verbatim in either emitted file
    expect(scaffold).not.toContain("x(){}; evil");
    expect(stub).not.toContain("x(){}; evil");

    // sanitized identifier used consistently: interface method, service method, call, stub method
    expect(scaffold).toContain(`${safe}(raw: unknown): string;`);
    expect(scaffold).toContain(`${safe}(): Observable<string>`);
    expect(scaffold).toContain(`transforms.${safe}(raw)`);
    expect(stub).toContain(`${safe}(raw: unknown): string {`);
    expect(stub).toContain(`not implemented: ${safe} transform`);
  });
});
