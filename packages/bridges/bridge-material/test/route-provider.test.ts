import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { routeProvider } from "../src/route-provider.js";

const feature: FeatureT = {
  id: "app-routes",
  capability: "route",
  tree: {
    type: "Routes",
    children: [
      { type: "Route", props: { path: "users", component: "UserList" } },
      { type: "Route", props: { path: "users/:id", component: "UserDetail" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("routeProvider", () => {
  it("emits one non-durable Routes module", () => {
    const assets = routeProvider.generate(feature);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe("routes/app-routes.routes.ts");
    expect(assets[0]?.durable).toBeFalsy();
  });

  it("emits a typed Routes array with lazy loadComponent entries", () => {
    const c = routeProvider.generate(feature)[0]?.content ?? "";
    expect(c).toContain("export const appRoutes: Routes = [");
    expect(c).toContain('path: "users"');
    expect(c).toContain('import("../components/UserList.js").then((m) => m.UserList)');
    expect(c).toContain('path: "users/:id"');
  });

  it("sanitizes untrusted path/component so they cannot break out of the string literal or identifier position", () => {
    const injected: FeatureT = {
      id: "evil-routes",
      capability: "route",
      tree: {
        type: "Routes",
        children: [
          {
            type: "Route",
            props: { path: 'x"); DROP;("', component: 'Evil"; x' },
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const c = routeProvider.generate(injected)[0]?.content ?? "";

    // path is a properly-escaped JSON string literal: raw payload never appears verbatim
    expect(c).not.toContain('x"); DROP;("');
    expect(c).toContain(JSON.stringify('x"); DROP;("'));

    // component becomes a sanitized identifier (pascal strips quotes/semicolons/spaces)
    expect(c).not.toContain('Evil"; x');
    expect(c).toContain(".then((m) => m.EvilX)");
    expect(c).toContain(JSON.stringify("../components/EvilX.js"));
  });
});
