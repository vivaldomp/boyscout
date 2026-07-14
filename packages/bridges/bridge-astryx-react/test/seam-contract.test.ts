import { fileURLToPath } from "node:url";
import { PLAIN_TS_OPTS, runSeamContract } from "@boyscout/bridge-contract-kit";
import type { FeatureT } from "@boyscout/schemas";
import { httpProvider } from "../src/http-provider.js";
import { serviceProvider } from "../src/service-provider.js";
import { storeProvider } from "../src/store-provider.js";

const serviceFeature: FeatureT = {
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
const storeFeature: FeatureT = {
  id: "cart-store",
  capability: "store",
  tree: {
    type: "Store",
    props: { name: "Cart", state: "{ items: string[] }" },
    children: [
      { type: "Action", props: { name: "addItem", payload: "string" } },
      { type: "Action", props: { name: "clear", payload: "void" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};
const httpFeature: FeatureT = {
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

runSeamContract({
  pkgRoot: fileURLToPath(new URL("../", import.meta.url)),
  compilerOptions: PLAIN_TS_OPTS,
  fixtures: [
    {
      label: "service",
      assets: serviceProvider.generate(serviceFeature),
      driftedContent:
        "export const userService = {\n  getUsers(): Promise<number> {\n    throw new Error();\n  },\n};\n",
    },
    {
      label: "store",
      assets: storeProvider.generate(storeFeature),
      driftedContent:
        "export const cartHandlers = {\n  addItem(state: { items: string[] }, payload: string): { items: number[] } {\n    throw new Error();\n  },\n  clear(state: { items: string[] }, payload: void): { items: string[] } {\n    throw new Error();\n  },\n};\n",
    },
    {
      label: "http",
      assets: httpProvider.generate(httpFeature),
      driftedContent:
        "export const usersApiTransforms = {\n  getUsers(raw: unknown): number {\n    throw new Error();\n  },\n};\n",
    },
  ],
});
