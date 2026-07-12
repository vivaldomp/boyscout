# SP3 — Logic-Bearing Tier & Durable Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the logic-bearing capability tier (`service`/`store`/`http`) and the durable scaffold↔human-logic seam — a governed deterministic scaffold in `.running/` bound by a typed contract to a create-if-absent human file in `src/`, proven headless.

**Architecture:** Seam pattern (A): the `.running/` scaffold owns the spec-derived typed contract and *depends on* the human `src/` leaf via a stable spec-derived import; the durable file imports nothing generated and is a self-annotated object literal, so structural assignability at the scaffold's binding line catches signature drift as a compile error. `emit()` gains a durable create-if-absent mode; the pre-barrier becomes capability-scoped; the post-barrier stays scaffold-only.

**Tech Stack:** pnpm workspaces, strict TypeScript 5.9.3 (NodeNext, raw-TS packages), Zod 4, Vitest 4, Eta 4.6.0 (`autoEscape:false` dumb templates), pinned Biome (`@biomejs/js-api`), `typescript` compiler API (drift test), `@astryxdesign/core` 0.1.4 (bridge only).

## Global Constraints

- **Determinism single path (D3a):** all serialize/sort/format/write go through `@boyscout/determinism` (`canonicalJson`, `sortByBytes`/`byteCompare`, `hash`, `format`, `writeBytes`). Never `JSON.stringify` for output, never `localeCompare`, never a second formatter.
- **Agnosticism invariant (§14.1):** `@boyscout/runtime` and every core package (`schemas`/`planner`/`codegen`/`guardrails`/`spec`) have **zero** dependency on `bridge-astryx-react`, `@astryxdesign/core`, or `react`. New framework knowledge lives only in `bridge-astryx-react`. The existing agnosticism guard test must stay green.
- **Determinism boundary (D2b/§11.2):** `.running/` scaffolds are byte-identical cross-OS and golden-tested; durable `src/` files are **outside** the boundary — never golden-tested, formatted only once on create, never re-emitted.
- **Dumb templates (§17.2):** Eta templates interpolate only; all derivation/recursion lives in the Provider. `autoEscape:false`.
- **Exact version pins:** add any dependency with `pnpm add -E` (no `^`/`~`).
- **Governance scope (D2d):** the post-barrier (`verify()`) runs on scaffold assets only; human logic bodies get compiler-enforced contract + lint-level rules.
- **Per-task gate:** before every commit run `pnpm --filter <pkg> typecheck` **and** the package's vitest tests. `vitest.config.ts` already includes `packages/**/test/**/*.test.ts` and `apps/**/test/**/*.test.ts`.
- **Commit message trailer:** end each commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Capability-scoped pre-barrier (`nodeTypesFor`)

The pre-barrier currently checks every AST node type against one flat catalog. Logic-bearing features speak their own vocabularies (`Service`/`Method`, etc.), so the barrier must resolve each feature's capability and check against *that* capability's node types. This is one atomic interface change across `schemas` → `guardrails` → `spec` → `runtime` → `bridge` (they cannot compile independently).

**Files:**
- Modify: `packages/schemas/src/index.ts` (BridgeRegistry interface)
- Modify: `packages/schemas/test/bridge-contract.test-d.ts:18-22`
- Modify: `packages/guardrails/src/index.ts` (checkExpressible)
- Modify: `packages/guardrails/test/pre.test.ts`
- Modify: `packages/spec/src/index.ts` (validateSpec)
- Modify: `packages/spec/test/validate.test.ts`
- Modify: `packages/runtime/src/index.ts:68`
- Modify: `packages/runtime/test/runtime.test.ts:12-14`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (registry)

**Interfaces:**
- Produces: `BridgeRegistry.nodeTypesFor(capability: string): readonly string[]` (replaces `componentTypes`); `checkExpressible(spec, registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">)`; `validateSpec(input, registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">)`.

- [ ] **Step 1: Update the guardrails pre-barrier test (RED)**

Replace `packages/guardrails/test/pre.test.ts` entirely:

```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const registry = {
  capabilities: ["component"],
  nodeTypesFor: (c: string): readonly string[] => (c === "component" ? ["Card", "VStack", "Text"] : []),
};

function spec(tree: SpecificationT["features"][number]["tree"], capability = "component"): SpecificationT {
  return {
    version: "1",
    features: [{ id: "f1", capability, tree, annotations: {}, props: {}, approved: true }],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("checkExpressible (pre-barrier)", () => {
  it("passes when every node type is in the capability's vocabulary", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Text" }] }), registry);
    expect(r).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 on an unknown node type, recursively", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Blob" }] }), registry);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
  });

  it("fails with 422 on an unknown capability", () => {
    const r = checkExpressible(spec({ type: "Card" }, "service"), registry);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("service"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`checkExpressible` still takes a `string[]`).

Run: `pnpm --filter @boyscout/guardrails test`
Expected: FAIL (type/shape mismatch on the `registry` argument).

- [ ] **Step 3: Update the `BridgeRegistry` interface in `packages/schemas/src/index.ts`**

Replace the `BridgeRegistry` interface (the `componentTypes` line) with:

```ts
/** The bridge's typed catalog: capabilities, per-capability allowed AST node types, and providers. */
export interface BridgeRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];
  providerFor(capability: string): Provider | undefined;
}
```

- [ ] **Step 4: Rewrite `checkExpressible` in `packages/guardrails/src/index.ts`**

Change the import line to add `BridgeRegistry`, and replace `checkExpressible`:

```ts
import type { Asset, AssetRule, BridgeRegistry, GuardrailResultT, SpecificationT } from "@boyscout/schemas";
```

```ts
/** Pre-barrier: each feature's capability must be registered, and every node type must be in that capability's vocabulary. */
export function checkExpressible(
  spec: SpecificationT,
  registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">,
): GuardrailResultT {
  const violations: string[] = [];
  for (const feature of spec.features) {
    if (!registry.capabilities.includes(feature.capability)) {
      violations.push(`feature ${feature.id}: unknown capability "${feature.capability}"`);
      continue;
    }
    const allowed = new Set(registry.nodeTypesFor(feature.capability));
    const types: string[] = [];
    collectTypes(feature.tree as TreeNode, types);
    for (const t of types) {
      if (!allowed.has(t)) violations.push(`feature ${feature.id}: unknown node type "${t}"`);
    }
  }
  return result(violations);
}
```

- [ ] **Step 5: Update `validateSpec` in `packages/spec/src/index.ts`**

```ts
import { checkExpressible } from "@boyscout/guardrails";
import {
  Specification,
  type BridgeRegistry,
  type GuardrailResultT,
  type SpecificationT,
} from "@boyscout/schemas";

export type ValidateResult =
  | { ok: true; spec: SpecificationT }
  | (GuardrailResultT & { ok: false });

/** The 422 gate: Zod shape-validation, then the capability-scoped pre-barrier. Never emits. */
export function validateSpec(
  input: unknown,
  registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">,
): ValidateResult {
  const parsed = Specification.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
      code: 422,
    };
  }
  const gate = checkExpressible(parsed.data, registry);
  if (!gate.ok) return gate as GuardrailResultT & { ok: false };
  return { ok: true, spec: parsed.data };
}
```

- [ ] **Step 6: Update the `validateSpec` caller in `packages/runtime/src/index.ts:68`**

```ts
  const validated = validateSpec(opts.specInput, bridge.registry);
```

- [ ] **Step 7: Update the Astryx registry in `packages/bridges/bridge-astryx-react/src/index.ts`**

Replace the `registry` object's `componentTypes` line:

```ts
export const registry: BridgeRegistry = {
  capabilities: ["component"],
  nodeTypesFor: (capability) => (capability === "component" ? COMPONENTS : []),
  providerFor: (capability) => (capability === "component" ? componentProvider : undefined),
};
```

- [ ] **Step 8: Update the two consumer tests and the type-test**

`packages/spec/test/validate.test.ts` — replace `const ALLOWED = ["Card", "Text"];` with a registry and update the three call sites:

```ts
const registry = {
  capabilities: ["component"],
  nodeTypesFor: (): readonly string[] => ["Card", "Text"],
};
```
Then change `validateSpec(good, ALLOWED)` → `validateSpec(good, registry)`, `validateSpec({ version: 1 }, ALLOWED)` → `validateSpec({ version: 1 }, registry)`, `validateSpec(bad, ALLOWED)` → `validateSpec(bad, registry)`.

`packages/runtime/test/runtime.test.ts` — in the `fakeBridge.registry` object replace line 14:

```ts
    nodeTypesFor: (c: string): readonly string[] => (c === "component" ? ["Card", "Text"] : []),
```

`packages/schemas/test/bridge-contract.test-d.ts` — replace line 20 (`componentTypes: ["Card"],`) with:

```ts
    nodeTypesFor: (_c: string): readonly string[] => ["Card"],
```

- [ ] **Step 9: Run typecheck + all tests (GREEN)**

Run: `pnpm --filter @boyscout/schemas --filter @boyscout/guardrails --filter @boyscout/spec --filter @boyscout/runtime --filter @boyscout/bridge-astryx-react typecheck && pnpm test`
Expected: all packages typecheck; full suite passes (69 prior + the new unknown-capability test).

- [ ] **Step 10: Commit**

```bash
git add packages/schemas packages/guardrails packages/spec packages/runtime packages/bridges
git commit -m "feat(guardrails): capability-scoped pre-barrier (nodeTypesFor)"
```

---

### Task 2: `Asset.durable` + durable `emit()` mode + scaffold-only `verify()`

`emit()` gains its second mode (D2b): scaffolds overwrite into `.running/`, durables create-if-absent into `src/`. `verify()` filters to scaffolds. No provider emits a durable asset yet — `emit()` is exported and unit-tested directly.

**Files:**
- Modify: `packages/schemas/src/index.ts` (Asset interface)
- Modify: `packages/runtime/src/index.ts` (emit, buildAssets verify, generate, GenerateResult)
- Modify: `apps/cli/src/main.ts` (report preserved)
- Create: `packages/runtime/test/durable.test.ts`
- Modify: `packages/runtime/test/runtime.test.ts` (append scaffold-only verify test)

**Interfaces:**
- Consumes: `emit`, `buildAssets`, `generate` from `@boyscout/runtime`.
- Produces: `Asset.durable?: boolean`; `EmitResult { scaffolds: string[]; durablesCreated: string[]; durablesPreserved: string[] }`; `GenerateResult { emitted: string[]; preserved: string[] }`.

- [ ] **Step 1: Write the durable-emit unit test (RED)** — `packages/runtime/test/durable.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "../src/index.js";

describe("emit — durable create-if-absent (D2b)", () => {
  it("writes scaffolds to .running (overwrite) and durables to src (create-if-absent)", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    const r = emit(
      [
        { path: "services/X.ts", content: "export const scaffold = 1;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    expect(r.scaffolds).toHaveLength(1);
    expect(r.durablesCreated).toHaveLength(1);
    expect(existsSync(join(outDir, ".running", "services/X.ts"))).toBe(true);
    expect(existsSync(join(outDir, "src", "services/x.ts"))).toBe(true);
  });

  it("preserves an existing durable file on re-emit; re-writes the scaffold", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    emit(
      [
        { path: "services/X.ts", content: "export const v = 1;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    const humanPath = join(outDir, "src", "services/x.ts");
    writeFileSync(humanPath, "export const stub = 'HUMAN';\n");
    const r = emit(
      [
        { path: "services/X.ts", content: "export const v = 2;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    expect(r.durablesPreserved).toHaveLength(1);
    expect(r.durablesCreated).toHaveLength(0);
    expect(readFileSync(humanPath, "utf8")).toBe("export const stub = 'HUMAN';\n");
    expect(readFileSync(join(outDir, ".running", "services/X.ts"), "utf8")).toContain("v = 2");
  });

  it("rejects a durable path that escapes src", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    expect(() => emit([{ path: "../evil.ts", content: "x", durable: true }], outDir)).toThrow(
      /traversal|\.\./,
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`emit` returns `string[]`, has no durable routing).

Run: `pnpm --filter @boyscout/runtime test durable`
Expected: FAIL (`r.scaffolds` undefined).

- [ ] **Step 3: Add `durable` to the `Asset` interface in `packages/schemas/src/index.ts`**

```ts
/** An emitted file before it is written to disk. `content` is raw at generate(), formatted after format(). */
export interface Asset {
  path: string;
  content: string;
  /** true = durable human-owned stub (src/, create-if-absent); false/undefined = disposable scaffold (.running/). */
  durable?: boolean;
}
```

- [ ] **Step 4: Rewrite `emit`, `verify` step, and `generate` in `packages/runtime/src/index.ts`**

Change the fs import to add `existsSync`:

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
```

Replace the `emit` function and the `GenerateResult`/`generate` with:

```ts
export interface GenerateResult {
  emitted: string[];
  preserved: string[];
}

export interface EmitResult {
  scaffolds: string[];
  durablesCreated: string[];
  durablesPreserved: string[];
}

function assertSafe(p: string): void {
  if (p.includes("..") || normalize(p) !== p || isAbsolute(p)) {
    throw new Error(`path traversal rejected: "${p}"`);
  }
}

/**
 * emit() — two modes (D2b). Scaffolds (durable !== true) overwrite into <outDir>/.running (idempotent).
 * Durables create-if-absent into <outDir>/src — an existing human file is preserved, never overwritten.
 * Both targets path-traversal shielded.
 */
export function emit(assets: readonly Asset[], outDir: string): EmitResult {
  const scaffolds: string[] = [];
  const durablesCreated: string[] = [];
  const durablesPreserved: string[] = [];
  for (const asset of assets) {
    assertSafe(asset.path);
    if (asset.durable) {
      const full = join(outDir, "src", asset.path);
      if (existsSync(full)) {
        durablesPreserved.push(full);
        continue;
      }
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, writeBytes(asset.content));
      durablesCreated.push(full);
    } else {
      const full = join(outDir, ".running", asset.path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, writeBytes(asset.content));
      scaffolds.push(full);
    }
  }
  return { scaffolds, durablesCreated, durablesPreserved };
}

/** The full protocol: build then emit. Reports newly emitted paths and preserved human files. */
export function generate(opts: GenerateOpts): GenerateResult {
  const assets = buildAssets(opts);
  const { scaffolds, durablesCreated, durablesPreserved } = emit(assets, opts.outDir);
  return { emitted: [...scaffolds, ...durablesCreated], preserved: durablesPreserved };
}
```

In `buildAssets`, replace the `verify()` block so the post-barrier sees scaffolds only:

```ts
  // verify(): post-barrier — scaffold assets only (durable human bodies are lint-level, D2d).
  const gate = checkAssets(
    assets.filter((a) => !a.durable),
    bridge.postRules,
  );
  if (!gate.ok) throw new GateError(gate.violations);
```

- [ ] **Step 5: Update the CLI to report preserved files — `apps/cli/src/main.ts`**

Replace the destructure + output loop inside `try`:

```ts
    const { emitted, preserved } = generate({ specInput, config, bridge, outDir: dirname(specPath) });
    for (const path of emitted) process.stdout.write(`${path}\n`);
    for (const path of preserved) process.stdout.write(`preserved: ${path}\n`);
    return 0;
```

- [ ] **Step 6: Append a scaffold-only verify test to `packages/runtime/test/runtime.test.ts`**

Inside the `describe("buildAssets", ...)` block add:

```ts
  it("verify() skips durable assets — the post-barrier is scaffold-only (D2d)", () => {
    const b: Bridge = {
      ...fakeBridge,
      registry: {
        ...fakeBridge.registry,
        providerFor: () => ({
          capability: "component",
          generate: (): Asset[] => [
            { path: "Widget.tsx", content: "export const W = () => <Card/>;\n", durable: false },
            { path: "impl.ts", content: 'export const x = () => "<div";\n', durable: true },
          ],
        }),
      },
    };
    // The durable asset contains "<div" (which fakeBridge.postRules rejects); it must be ignored.
    const assets = buildAssets({ specInput: spec(), config, bridge: b });
    expect(assets.some((a) => a.durable)).toBe(true);
  });
```

- [ ] **Step 7: Run typecheck + tests (GREEN)**

Run: `pnpm --filter @boyscout/schemas --filter @boyscout/runtime typecheck && pnpm --filter @boyscout/runtime test && pnpm --filter boyscout typecheck`
Expected: PASS (durable routing, preserve, traversal, scaffold-only verify all green; prior runtime tests still pass — component fixture yields 1 scaffold, `emitted` length 1).

- [ ] **Step 8: Commit**

```bash
git add packages/schemas packages/runtime apps/cli
git commit -m "feat(runtime): durable emit mode (create-if-absent -> src) + scaffold-only verify"
```

---

### Task 3: `service` logic-bearing capability

Provider emits two assets: the scaffold (`.running/services/<Name>.ts`, `durable:false`) declaring the typed contract + typed re-export, and the human stub (`src/services/<kebab>.ts`, `durable:true`) — a self-annotated object literal. Seam pattern (A).

**Files:**
- Create: `packages/bridges/bridge-astryx-react/templates/service.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/templates/service.impl.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/src/naming.ts`
- Create: `packages/bridges/bridge-astryx-react/src/service-provider.ts`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (register service)
- Create: `packages/bridges/bridge-astryx-react/test/service-provider.test.ts`

**Interfaces:**
- Consumes: `render` from `@boyscout/codegen`; `Asset`, `AstNodeT`, `FeatureT`, `Provider`, `SeamContractT` from `@boyscout/schemas`.
- Produces: `serviceProvider: Provider`, `serviceSeam(feature): SeamContractT`, `SERVICE_NODE_TYPES = ["Service", "Method"]`; shared `kebab`/`camel` in `naming.ts`.

- [ ] **Step 1: Write the provider test (RED)** — `packages/bridges/bridge-astryx-react/test/service-provider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL** (module not found).

Run: `pnpm --filter @boyscout/bridge-astryx-react test service`
Expected: FAIL (cannot resolve `../src/service-provider.js`).

- [ ] **Step 3: Create shared naming helpers** — `packages/bridges/bridge-astryx-react/src/naming.ts`:

```ts
/** "UserService" -> "user-service". Splits camelCase and non-alphanumerics. */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
}

/** "UserService" -> "userService". */
export function camel(s: string): string {
  const parts = s.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/);
  return parts
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
    .join("");
}
```

- [ ] **Step 4: Create the scaffold template** — `packages/bridges/bridge-astryx-react/templates/service.ts.eta`:

```
import { <%= it.instanceName %> as impl } from "<%= it.importSpecifier %>";

export interface <%= it.interfaceName %> {
<% it.methods.forEach(function (m) { %>  <%= m.name %>(<%= m.params %>): <%= m.returns %>;
<% }) %>}

export const <%= it.instanceName %>: <%= it.interfaceName %> = impl;
```

- [ ] **Step 5: Create the stub template** — `packages/bridges/bridge-astryx-react/templates/service.impl.ts.eta`:

```
export const <%= it.instanceName %> = {
<% it.methods.forEach(function (m) { %>  <%= m.name %>(<%= m.params %>): <%= m.returns %> {
    throw new Error("not implemented: <%= m.name %>");
  },
<% }) %>};
```

- [ ] **Step 6: Create the provider** — `packages/bridges/bridge-astryx-react/src/service-provider.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const SERVICE_NODE_TYPES = ["Service", "Method"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/service.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/service.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Method {
  name: string;
  params: string;
  returns: string;
}

function methodsOf(tree: AstNodeT): Method[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Method")
    .map((c) => {
      const p = c.props ?? {};
      return {
        name: String(p.name ?? ""),
        params: String(p.params ?? ""),
        returns: String(p.returns ?? "void"),
      };
    });
}

/** The durable seam: stable spec-derived src path + the typed contract the human logic must satisfy. */
export function serviceSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `services/${kebab(name)}.ts`,
    typedSignature: `${name}Contract`,
    binding: "typed re-export",
  };
}

export const serviceProvider: Provider = {
  capability: "service",
  generate(feature: FeatureT): Asset[] {
    const name = String(feature.tree.props?.name ?? "");
    const methods = methodsOf(feature.tree);
    const interfaceName = `${name}Contract`;
    const instanceName = camel(name);
    const importSpecifier = `../../src/services/${kebab(name)}.js`;
    const scaffold = render(SCAFFOLD, { interfaceName, instanceName, importSpecifier, methods });
    const stub = render(STUB, { instanceName, methods });
    return [
      { path: `services/${name}.ts`, content: scaffold, durable: false },
      { path: serviceSeam(feature).srcPath, content: stub, durable: true },
    ];
  },
};
```

- [ ] **Step 7: Register the service capability** — `packages/bridges/bridge-astryx-react/src/index.ts`:

Add imports and extend the registry:

```ts
import { SERVICE_NODE_TYPES, serviceProvider } from "./service-provider.js";
```

```ts
export const registry: BridgeRegistry = {
  capabilities: ["component", "service"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "service"
        ? SERVICE_NODE_TYPES
        : [],
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "service"
        ? serviceProvider
        : undefined,
};
```

- [ ] **Step 8: Run typecheck + tests (GREEN)**

Run: `pnpm --filter @boyscout/bridge-astryx-react typecheck && pnpm --filter @boyscout/bridge-astryx-react test`
Expected: PASS (provider shape, seam contract, vocabulary; registry-contract test still green).

- [ ] **Step 9: Commit**

```bash
git add packages/bridges/bridge-astryx-react
git commit -m "feat(bridge): service logic-bearing capability + durable seam"
```

---

### Task 4: `store` logic-bearing capability (React hook idiom)

Scaffold emits a `useReducer` hook with a typed `State`/`Action`/`Handlers` contract; the human stub is a self-annotated handlers object (state type inlined so the leaf imports nothing generated). Requires `@types/react` as a bridge dev-dependency (types-only — never enters the runtime closure).

**Files:**
- Modify: `packages/bridges/bridge-astryx-react/package.json` (add `@types/react` devDep)
- Create: `packages/bridges/bridge-astryx-react/templates/store.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/templates/store.impl.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/src/store-provider.ts`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (register store)
- Create: `packages/bridges/bridge-astryx-react/test/store-provider.test.ts`

**Interfaces:**
- Consumes: `render`, schemas types, `camel`/`kebab` from `./naming.js`.
- Produces: `storeProvider: Provider`, `storeSeam(feature): SeamContractT`, `STORE_NODE_TYPES = ["Store", "Action"]`.

- [ ] **Step 1: Add the `@types/react` dev-dependency**

Run: `pnpm --filter @boyscout/bridge-astryx-react add -D -E @types/react`
Expected: `@types/react` pinned exactly in `devDependencies`.

- [ ] **Step 2: Write the provider test (RED)** — `packages/bridges/bridge-astryx-react/test/store-provider.test.ts`:

```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { STORE_NODE_TYPES, storeProvider, storeSeam } from "../src/store-provider.js";

const feature: FeatureT = {
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

describe("store provider", () => {
  it("emits a .running hook scaffold and a durable handlers stub", () => {
    const assets = storeProvider.generate(feature);
    expect(assets).toHaveLength(2);
    const scaffold = assets.find((a) => !a.durable);
    const stub = assets.find((a) => a.durable);
    expect(scaffold?.path).toBe("stores/useCart.ts");
    expect(stub?.path).toBe("stores/cart.ts");
    expect(scaffold?.content).toContain('import { useReducer } from "react"');
    expect(scaffold?.content).toContain("interface CartHandlers");
    expect(scaffold?.content).toContain("const handlers: CartHandlers = cartHandlers");
    expect(stub?.content).toContain("addItem(state: { items: string[] }, payload: string)");
  });

  it("declares a spec-derived seam contract and vocabulary", () => {
    expect(storeSeam(feature).srcPath).toBe("stores/cart.ts");
    expect(STORE_NODE_TYPES).toEqual(["Store", "Action"]);
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (module not found).

Run: `pnpm --filter @boyscout/bridge-astryx-react test store`
Expected: FAIL.

- [ ] **Step 4: Create the scaffold template** — `packages/bridges/bridge-astryx-react/templates/store.ts.eta`:

```
import { useReducer } from "react";
import { <%= it.handlersName %> } from "<%= it.importSpecifier %>";

export type <%= it.stateType %> = <%= it.state %>;

export type <%= it.actionType %> =
<% it.actions.forEach(function (a) { %>  | { type: "<%= a.name %>"; payload: <%= a.payload %> }
<% }) %>;

export interface <%= it.handlersInterface %> {
<% it.actions.forEach(function (a) { %>  <%= a.name %>(state: <%= it.stateType %>, payload: <%= a.payload %>): <%= it.stateType %>;
<% }) %>}

const handlers: <%= it.handlersInterface %> = <%= it.handlersName %>;

function reducer(state: <%= it.stateType %>, action: <%= it.actionType %>): <%= it.stateType %> {
  switch (action.type) {
<% it.actions.forEach(function (a) { %>    case "<%= a.name %>":
      return handlers.<%= a.name %>(state, action.payload);
<% }) %>  }
}

export function <%= it.hookName %>(initial: <%= it.stateType %>) {
  return useReducer(reducer, initial);
}
```

- [ ] **Step 5: Create the stub template** — `packages/bridges/bridge-astryx-react/templates/store.impl.ts.eta`:

```
export const <%= it.handlersName %> = {
<% it.actions.forEach(function (a) { %>  <%= a.name %>(state: <%= it.state %>, payload: <%= a.payload %>): <%= it.state %> {
    throw new Error("not implemented: <%= a.name %>");
  },
<% }) %>};
```

- [ ] **Step 6: Create the provider** — `packages/bridges/bridge-astryx-react/src/store-provider.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const STORE_NODE_TYPES = ["Store", "Action"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/store.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/store.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Action {
  name: string;
  payload: string;
}

function actionsOf(tree: AstNodeT): Action[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Action")
    .map((c) => {
      const p = c.props ?? {};
      return { name: String(p.name ?? ""), payload: String(p.payload ?? "void") };
    });
}

export function storeSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `stores/${kebab(name)}.ts`,
    typedSignature: `${name}Handlers`,
    binding: "reducer handlers",
  };
}

export const storeProvider: Provider = {
  capability: "store",
  generate(feature: FeatureT): Asset[] {
    const p = feature.tree.props ?? {};
    const name = String(p.name ?? "");
    const state = String(p.state ?? "unknown");
    const actions = actionsOf(feature.tree);
    const data = {
      state,
      actions,
      hookName: `use${name}`,
      handlersName: `${camel(name)}Handlers`,
      stateType: `${name}State`,
      actionType: `${name}Action`,
      handlersInterface: `${name}Handlers`,
      importSpecifier: `../../src/stores/${kebab(name)}.js`,
    };
    return [
      { path: `stores/use${name}.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: storeSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
```

- [ ] **Step 7: Register the store capability** — `packages/bridges/bridge-astryx-react/src/index.ts`:

Add `import { STORE_NODE_TYPES, storeProvider } from "./store-provider.js";` and extend the registry (chained ternaries — `component`/`service`/`store`):

```ts
export const registry: BridgeRegistry = {
  capabilities: ["component", "service", "store"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "service"
        ? SERVICE_NODE_TYPES
        : capability === "store"
          ? STORE_NODE_TYPES
          : [],
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "service"
        ? serviceProvider
        : capability === "store"
          ? storeProvider
          : undefined,
};
```

- [ ] **Step 8: Run typecheck + tests (GREEN)**

Run: `pnpm --filter @boyscout/bridge-astryx-react typecheck && pnpm --filter @boyscout/bridge-astryx-react test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/bridges/bridge-astryx-react
git commit -m "feat(bridge): store logic-bearing capability (useReducer seam) + @types/react devDep"
```

---

### Task 5: `http` logic-bearing capability (typed fetch client + transform seam)

Scaffold emits a typed fetch client; the human stub is a self-annotated `Transforms` object (response→domain mapping). Seam pattern (A).

**Files:**
- Create: `packages/bridges/bridge-astryx-react/templates/http.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/templates/http.impl.ts.eta`
- Create: `packages/bridges/bridge-astryx-react/src/http-provider.ts`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (register http)
- Create: `packages/bridges/bridge-astryx-react/test/http-provider.test.ts`

**Interfaces:**
- Produces: `httpProvider: Provider`, `httpSeam(feature): SeamContractT`, `HTTP_NODE_TYPES = ["Http", "Endpoint"]`.

- [ ] **Step 1: Write the provider test (RED)** — `packages/bridges/bridge-astryx-react/test/http-provider.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it — expect FAIL** (module not found).

Run: `pnpm --filter @boyscout/bridge-astryx-react test http`
Expected: FAIL.

- [ ] **Step 3: Create the scaffold template** — `packages/bridges/bridge-astryx-react/templates/http.ts.eta`:

```
import { <%= it.transformsName %> } from "<%= it.importSpecifier %>";

export interface <%= it.transformsInterface %> {
<% it.endpoints.forEach(function (e) { %>  <%= e.name %>(raw: unknown): <%= e.response %>;
<% }) %>}

const transforms: <%= it.transformsInterface %> = <%= it.transformsName %>;

export const <%= it.clientName %> = {
<% it.endpoints.forEach(function (e) { %>  async <%= e.name %>(): Promise<<%= e.response %>> {
    const res = await fetch("<%= e.path %>", { method: "<%= e.method %>" });
    return transforms.<%= e.name %>(await res.json());
  },
<% }) %>};
```

- [ ] **Step 4: Create the stub template** — `packages/bridges/bridge-astryx-react/templates/http.impl.ts.eta`:

```
export const <%= it.transformsName %> = {
<% it.endpoints.forEach(function (e) { %>  <%= e.name %>(raw: unknown): <%= e.response %> {
    throw new Error("not implemented: <%= e.name %> transform");
  },
<% }) %>};
```

- [ ] **Step 5: Create the provider** — `packages/bridges/bridge-astryx-react/src/http-provider.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const HTTP_NODE_TYPES = ["Http", "Endpoint"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/http.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/http.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Endpoint {
  name: string;
  method: string;
  path: string;
  response: string;
}

function endpointsOf(tree: AstNodeT): Endpoint[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Endpoint")
    .map((c) => {
      const p = c.props ?? {};
      return {
        name: String(p.name ?? ""),
        method: String(p.method ?? "GET"),
        path: String(p.path ?? "/"),
        response: String(p.response ?? "unknown"),
      };
    });
}

export function httpSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `http/${kebab(name)}.ts`,
    typedSignature: `${name}Transforms`,
    binding: "response transforms",
  };
}

export const httpProvider: Provider = {
  capability: "http",
  generate(feature: FeatureT): Asset[] {
    const name = String(feature.tree.props?.name ?? "");
    const endpoints = endpointsOf(feature.tree);
    const data = {
      endpoints,
      clientName: camel(name),
      transformsName: `${camel(name)}Transforms`,
      transformsInterface: `${name}Transforms`,
      importSpecifier: `../../src/http/${kebab(name)}.js`,
    };
    return [
      { path: `http/${name}.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: httpSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
```

- [ ] **Step 6: Register the http capability** — `packages/bridges/bridge-astryx-react/src/index.ts`:

Add `import { HTTP_NODE_TYPES, httpProvider } from "./http-provider.js";` and extend both chained ternaries with the `http` arm:

```ts
export const registry: BridgeRegistry = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "service"
        ? SERVICE_NODE_TYPES
        : capability === "store"
          ? STORE_NODE_TYPES
          : capability === "http"
            ? HTTP_NODE_TYPES
            : [],
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "service"
        ? serviceProvider
        : capability === "store"
          ? storeProvider
          : capability === "http"
            ? httpProvider
            : undefined,
};
```

- [ ] **Step 7: Run typecheck + tests (GREEN)**

Run: `pnpm --filter @boyscout/bridge-astryx-react typecheck && pnpm --filter @boyscout/bridge-astryx-react test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/bridges/bridge-astryx-react
git commit -m "feat(bridge): http logic-bearing capability (typed fetch + transform seam)"
```

---

### Task 6: Signature-drift compile-error contract test (D2d)

The core seam proof: a matching human stub compiles clean; a drifted one fails `tsc`. Uses the `typescript` compiler API (already a bridge dep) over real provider output. Temp fixtures live under the bridge package dir so `react` types (store) and lib.dom (http `fetch`) resolve via upward `node_modules` lookup.

**Files:**
- Create: `packages/bridges/bridge-astryx-react/test/seam-contract.test.ts`
- Modify: `.gitignore` (ignore the temp fixture dirs)

**Interfaces:**
- Consumes: `serviceProvider`, `storeProvider`, `httpProvider`; `ts` from `typescript`.

- [ ] **Step 1: Ignore the temp fixture dirs** — append to `.gitignore`:

```
.seam-tmp-*
```

- [ ] **Step 2: Write the seam contract test (RED)** — `packages/bridges/bridge-astryx-react/test/seam-contract.test.ts`:

```ts
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
```

- [ ] **Step 3: Run it (GREEN — the providers already emit correct seams)**

Run: `pnpm --filter @boyscout/bridge-astryx-react test seam-contract`
Expected: PASS — 3 matching cases (0 diagnostics), 3 drift cases (>0 diagnostics). If a *matching* case reports diagnostics, the fault is in the corresponding Task 3/4/5 template (fix the template, not the test). If `react` fails to resolve in the store case, confirm Task 4 installed `@types/react` and that the temp dir is under `pkgRoot`.

- [ ] **Step 4: Commit**

```bash
git add packages/bridges/bridge-astryx-react/test/seam-contract.test.ts .gitignore
git commit -m "test(bridge): seam signature-drift compile-error proof (service/store/http)"
```

---

### Task 7: Cross-OS golden (scaffold-only) + regen-preserve E2E

The two remaining done-proofs, wired end-to-end through the runtime and the existing 3-OS CI matrix. The golden covers `.running/` scaffolds only; a full `generate` run proves the durable stub survives regeneration.

**Files:**
- Create: `apps/cli/test/fixtures/seam-spec.json`
- Create: `apps/cli/test/fixtures/seam-config.yaml`
- Create: `apps/cli/test/seam-golden.test.ts`
- Golden outputs (bootstrapped by the test on first run): `apps/cli/test/goldens/seam/services/UserService.ts`, `apps/cli/test/goldens/seam/stores/useCart.ts`, `apps/cli/test/goldens/seam/http/UsersApi.ts`

**Interfaces:**
- Consumes: `bridge` from `@boyscout/bridge-astryx-react`; `buildAssets`, `generate`, `loadConfig` from `@boyscout/runtime`; `hash`, `writeBytes` from `@boyscout/determinism`.

- [ ] **Step 1: Create the fixture spec** — `apps/cli/test/fixtures/seam-spec.json`:

```json
{
  "version": "1",
  "features": [
    {
      "id": "user-service",
      "capability": "service",
      "tree": {
        "type": "Service",
        "props": { "name": "UserService" },
        "children": [
          { "type": "Method", "props": { "name": "getUsers", "params": "", "returns": "Promise<string[]>" } }
        ]
      },
      "annotations": {},
      "props": {},
      "approved": true
    },
    {
      "id": "cart-store",
      "capability": "store",
      "tree": {
        "type": "Store",
        "props": { "name": "Cart", "state": "{ items: string[] }" },
        "children": [
          { "type": "Action", "props": { "name": "addItem", "payload": "string" } },
          { "type": "Action", "props": { "name": "clear", "payload": "void" } }
        ]
      },
      "annotations": {},
      "props": {},
      "approved": true
    },
    {
      "id": "users-api",
      "capability": "http",
      "tree": {
        "type": "Http",
        "props": { "name": "UsersApi" },
        "children": [
          { "type": "Endpoint", "props": { "name": "getUsers", "method": "GET", "path": "/users", "response": "string[]" } }
        ]
      },
      "annotations": {},
      "props": {},
      "approved": true
    }
  ],
  "metadata": { "bridge": "astryx-react", "platform": "react", "checksum": "" }
}
```

- [ ] **Step 2: Create the fixture config** — `apps/cli/test/fixtures/seam-config.yaml`:

```yaml
platform: react
bridge: astryx-react
capabilities:
  - service
  - store
  - http
```

- [ ] **Step 3: Write the golden + regen-preserve test (RED — goldens absent, so it bootstraps)** — `apps/cli/test/seam-golden.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, generate, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const config = loadConfig(readFileSync(here("./fixtures/seam-config.yaml"), "utf8"));
const specInput = JSON.parse(readFileSync(here("./fixtures/seam-spec.json"), "utf8"));

describe("cross-OS golden: logic-bearing scaffolds are byte-identical (scaffold only, D2b)", () => {
  it("every .running scaffold matches its committed golden; durables are excluded", () => {
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);
    const durables = assets.filter((a) => a.durable);

    // Three logic-bearing features -> three scaffolds + three durable stubs.
    expect(scaffolds).toHaveLength(3);
    expect(durables).toHaveLength(3);

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/seam/${asset.path}`);
      const actualBytes = writeBytes(asset.content);
      if (UPDATE) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, actualBytes);
        continue;
      }
      expect(existsSync(goldenPath), `missing golden for ${asset.path}`).toBe(true);
      expect(hash(actualBytes), `byte drift in ${asset.path}`).toBe(
        hash(readFileSync(goldenPath)),
      );
    }
  });
});

describe("durable seam: regen preserves the human file (D2b)", () => {
  it("creates the src stub, then leaves it untouched on a second generate; re-emits the scaffold", () => {
    const outDir = mkdtempSync(join(tmpdir(), "seam-e2e-"));
    const first = generate({ specInput, config, bridge, outDir });
    const stubPath = join(outDir, "src", "services/user-service.ts");
    const scaffoldPath = join(outDir, ".running", "services/UserService.ts");
    expect(existsSync(stubPath)).toBe(true);
    expect(first.emitted).toContain(stubPath);

    const humanEdit = "export const userService = {\n  async getUsers() {\n    return ['real'];\n  },\n};\n";
    writeFileSync(stubPath, humanEdit);
    const scaffoldBefore = readFileSync(scaffoldPath, "utf8");

    const second = generate({ specInput, config, bridge, outDir });
    expect(readFileSync(stubPath, "utf8")).toBe(humanEdit); // preserved
    expect(second.preserved).toContain(stubPath);
    expect(second.emitted).not.toContain(stubPath); // not re-created
    expect(readFileSync(scaffoldPath, "utf8")).toBe(scaffoldBefore); // scaffold re-emitted identical
  });
});
```

- [ ] **Step 4: Bootstrap the goldens, then verify**

Run: `UPDATE_GOLDENS=1 pnpm --filter boyscout test seam-golden`
Then inspect the three generated files under `apps/cli/test/goldens/seam/` — confirm each is a clean, formatted scaffold (the service re-export, the `useCart` hook, the `UsersApi` fetch client) with a trailing newline and no `.running`/`src` leakage.

Run: `pnpm --filter boyscout test seam-golden`
Expected: PASS (hashes match; regen-preserve green).

- [ ] **Step 5: Run the whole suite + typecheck**

Run: `pnpm typecheck && pnpm test && pnpm format:check`
Expected: all green. If `format:check` flags the new sources, run `pnpm format` and re-run tests (whitespace-only).

- [ ] **Step 6: Commit**

```bash
git add apps/cli/test/fixtures/seam-spec.json apps/cli/test/fixtures/seam-config.yaml apps/cli/test/seam-golden.test.ts apps/cli/test/goldens/seam
git commit -m "test(sp3): cross-OS golden (scaffold-only) + regen-preserve E2E"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-11-sp3-logic-bearing-seam-design.md`):
- `Asset.durable` + `emit()` durable create-if-absent → Task 2. ✓
- `BridgeRegistry.nodeTypesFor` + capability-scoped pre-barrier → Task 1. ✓
- Post-barrier scaffold-only → Task 2 (Step 4 + Step 6 test). ✓
- Three logic-bearing providers + 6 templates + 3 SeamContracts + registry rows → Tasks 3/4/5. ✓
- Determinism: scaffolds golden cross-OS, durables excluded → Task 7. ✓
- Done-proof "regen preserves human file" → Task 7 (E2E) + Task 2 (unit). ✓
- Done-proof "signature drift → compile error" → Task 6. ✓
- Done-proof "golden covers scaffold only" → Task 7 (filters `!durable`, asserts durables excluded). ✓
- Done-proof "create-if-absent" → Task 2. ✓
- Pre-barrier per-capability 422 (unknown type + unknown capability) → Task 1. ✓
- Seam contract present per capability → Tasks 3/4/5 (seam fns + tests). ✓
- Agnosticism guard + Registry contract carried over → unchanged; `@types/react` is dev/types-only (Task 4), never in the runtime closure. ✓

**2. Placeholder scan:** No `TBD`/`TODO` outside intentional stub-body example strings (`"not implemented: ..."`, `/* ... */`), which are literal generated output. Every code step carries complete code.

**3. Type consistency:**
- `nodeTypesFor(capability: string): readonly string[]` — identical in schemas interface (Task 1), guardrails `Pick` (Task 1), spec `Pick` (Task 1), and all bridge registry literals (Tasks 1/3/4/5). ✓
- `Asset.durable?: boolean` — schemas (Task 2); consumed by `emit` filter (Task 2) and every provider return (Tasks 3/4/5). ✓
- `GenerateResult { emitted; preserved }` — runtime (Task 2); consumed by CLI (Task 2) and the E2E test (Task 7). ✓
- Seam export names — `serviceSeam`/`storeSeam`/`httpSeam` + `SERVICE_NODE_TYPES`/`STORE_NODE_TYPES`/`HTTP_NODE_TYPES` match between provider files, `index.ts` registry, and tests. ✓
- Scaffold binding lines asserted in Task 6 (`const userService: UserServiceContract = impl`, `const handlers: CartHandlers = cartHandlers`, `const transforms: UsersApiTransforms = usersApiTransforms`) match the templates in Tasks 3/4/5 verbatim. ✓
