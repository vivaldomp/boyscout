import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Asset, FeatureT } from "@boyscout/schemas";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { httpProvider } from "../src/http-provider.js";
import { serviceProvider } from "../src/service-provider.js";
import { storeProvider } from "../src/store-provider.js";

// Temp fixtures live under the package dir so `react`/lib types resolve via upward node_modules lookup.
const pkgRoot = fileURLToPath(new URL("../", import.meta.url));
const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
});

/** Write the scaffold (.running) + a stub (src) into a temp project and return type diagnostics. */
function diagnose(scaffold: Asset, stub: { path: string; content: string }): readonly ts.Diagnostic[] {
  const dir = mkdtempSync(join(pkgRoot, ".seam-tmp-"));
  tmps.push(dir);
  const scaffoldPath = join(dir, ".running", scaffold.path);
  const stubPath = join(dir, "src", stub.path);
  mkdirSync(dirname(scaffoldPath), { recursive: true });
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(scaffoldPath, scaffold.content);
  writeFileSync(stubPath, stub.content);
  const program = ts.createProgram([scaffoldPath, stubPath], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  });
  return ts.getPreEmitDiagnostics(program);
}

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

function parts(assets: Asset[]) {
  const scaffold = assets.find((a) => !a.durable) as Asset;
  const stub = assets.find((a) => a.durable) as Asset;
  return { scaffold, stub };
}

describe("seam contract: matching stub compiles, drifted stub fails (D2d)", () => {
  it("service — generated stub satisfies the generated contract", () => {
    const { scaffold, stub } = parts(serviceProvider.generate(serviceFeature));
    expect(diagnose(scaffold, stub)).toHaveLength(0);
  });

  it("service — a drifted return type is a compile error", () => {
    const { scaffold, stub } = parts(serviceProvider.generate(serviceFeature));
    const drift = {
      path: stub.path,
      content: "export const userService = {\n  getUsers(): Promise<number> {\n    throw new Error();\n  },\n};\n",
    };
    expect(diagnose(scaffold, drift).length).toBeGreaterThan(0);
  });

  it("store — generated handlers satisfy the generated contract", () => {
    const { scaffold, stub } = parts(storeProvider.generate(storeFeature));
    expect(diagnose(scaffold, stub)).toHaveLength(0);
  });

  it("store — a drifted handler return is a compile error", () => {
    const { scaffold, stub } = parts(storeProvider.generate(storeFeature));
    const drift = {
      path: stub.path,
      content:
        "export const cartHandlers = {\n" +
        "  addItem(state: { items: string[] }, payload: string): { items: number[] } {\n" +
        "    throw new Error();\n" +
        "  },\n" +
        "  clear(state: { items: string[] }, payload: void): { items: string[] } {\n" +
        "    throw new Error();\n" +
        "  },\n" +
        "};\n",
    };
    expect(diagnose(scaffold, drift).length).toBeGreaterThan(0);
  });

  it("http — generated transforms satisfy the generated contract", () => {
    const { scaffold, stub } = parts(httpProvider.generate(httpFeature));
    expect(diagnose(scaffold, stub)).toHaveLength(0);
  });

  it("http — a drifted transform return is a compile error", () => {
    const { scaffold, stub } = parts(httpProvider.generate(httpFeature));
    const drift = {
      path: stub.path,
      content: "export const usersApiTransforms = {\n  getUsers(raw: unknown): number {\n    throw new Error();\n  },\n};\n",
    };
    expect(diagnose(scaffold, drift).length).toBeGreaterThan(0);
  });
});
