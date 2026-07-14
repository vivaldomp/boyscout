import { fileURLToPath } from "node:url";
import { ANGULAR_OPTS, runSeamContract } from "@boyscout/bridge-contract-kit";
import type { FeatureT } from "@boyscout/schemas";
import { httpProvider } from "../src/http-provider.js";

const httpFeature: FeatureT = {
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

runSeamContract({
  pkgRoot: fileURLToPath(new URL("../", import.meta.url)),
  compilerOptions: ANGULAR_OPTS,
  fixtures: [
    {
      label: "http",
      assets: httpProvider.generate(httpFeature),
      driftedContent:
        "export const usersApiTransforms = {\n  getUsers(raw: unknown): number {\n    throw new Error();\n  },\n};\n",
    },
  ],
});
