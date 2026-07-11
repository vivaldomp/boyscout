# SP2 — Headless Declarative Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless walking skeleton that turns a hand-authored `boyscout-spec.json` into a byte-identical Astryx React `component` in `.running/`, with a double-barrier guardrail that fails the gate (422) — the roadmap kill-gate.

**Architecture:** Seven minimal packages split per §19.2. The agnostic core (`spec`, `planner`, `codegen`, `guardrails`, `runtime`) never imports the bridge; the runtime resolves a `Bridge` interface passed in at the composition root (`apps/cli`). All serialize/sort/format/write routes through SP1's `@boyscout/determinism`. `@boyscout/bridge-astryx-react` is the only package that knows React/Astryx.

**Tech Stack:** pnpm workspaces, strict TypeScript 5.9.3 (NodeNext, raw-TS packages), Zod 4, Vitest 4, Eta (dumb templates), `@astryxdesign/core` (React + StyleX), `@biomejs/js-api` (pinned, format + lint), `yaml` (config), `typescript` compiler API (design-system AST rule).

## Global Constraints

- **Determinism is enforced, not conventional (D3a):** every serialize/sort/format/write goes through `@boyscout/determinism` — `canonicalJson`, `sortByBytes`/`byteCompare`, `hash`, `format`, `writeBytes`. Never `JSON.stringify` for output, never `localeCompare`, never a second formatter.
- **Cross-OS byte-identity (D3b):** goldens must be byte-identical on Linux/macOS/Windows in CI. LF-only, UTF-8, no BOM, fixed final newline (via `writeBytes`).
- **Agnosticism invariant (§14.1):** `@boyscout/runtime` and all core packages have ZERO dependency on `@boyscout/bridge-astryx-react` or `@astryxdesign/core`. The bridge is passed in by interface. A test enforces this structurally.
- **No logic in templates (§14.2):** Eta templates are dumb interpolation only. The AST tree-walk (recursion) lives in the bridge Provider, not the template.
- **Double barrier (§10):** pre-generation restriction (unexpressible → 422 at `validate()`) AND post-generation AST/lint proof (violation → 422 at `verify()`). Both fail with `GuardrailResult { ok:false, code:422 }`.
- **Exact version pins:** no `^`/`~`. Add external deps with `pnpm --filter <pkg> add -E <dep>`. Match existing pins: `@biomejs/js-api@6.0.0`, `@biomejs/wasm-nodejs@2.5.3`, `typescript@5.9.3`.
- **Emit is disposable-only (D2b):** write to `.running/` via `writeBytes`, path-traversal shielded. Durable `src/` seam is SP3 — not here.
- **Node 20 floor**, `"type": "module"`, NodeNext resolution.

## File Structure

```
pnpm-workspace.yaml                         MODIFY: add packages/bridges/*, apps/*
vitest.config.ts                            MODIFY: include packages/**/test, apps/**/test
.gitignore                                  MODIFY: add .running/
packages/schemas/src/index.ts               MODIFY: add Asset, AssetRule, Provider, BridgeRegistry, Bridge
packages/schemas/test/bridge-contract.test-d.ts   CREATE
packages/codegen/                           CREATE  @boyscout/codegen   — Eta engine (agnostic)
packages/planner/                           CREATE  @boyscout/planner   — Specification -> ExecutionGraph
packages/guardrails/                        CREATE  @boyscout/guardrails — pre (checkExpressible) + post (checkAssets, biomeLint)
packages/spec/                              CREATE  @boyscout/spec      — validateSpec (Zod gate + pre-barrier)
packages/runtime/                           CREATE  @boyscout/runtime   — protocol: loadConfig/buildAssets/emit/generate
packages/bridges/bridge-astryx-react/       CREATE  @boyscout/bridge-astryx-react — Registry, Provider, template, rules
apps/cli/                                   CREATE  boyscout generate (composition root)
```

Each new package mirrors SP1: `package.json` (`"type":"module"`, `"exports": { ".": "./src/index.ts" }`, `"scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" }`), and `tsconfig.json` extending the base at the correct depth (`../../tsconfig.base.json` for `packages/*` and `apps/*`; `../../../tsconfig.base.json` for `packages/bridges/*`).

---

### Task 1: Runtime↔bridge contracts in `@boyscout/schemas`

Define the interfaces both the runtime and the bridge implement, so neither depends on the other (both depend on `schemas`). Pure types — verified with a type-level test like SP1's `capability-contract.test-d.ts`.

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/schemas/test/bridge-contract.test-d.ts`

**Interfaces:**
- Consumes: `FeatureT` (existing, `packages/schemas/src/index.ts`).
- Produces: `Asset`, `AssetRule`, `Provider`, `BridgeRegistry`, `Bridge` (below), consumed by Tasks 4, 6, 7, 8.

- [ ] **Step 1: Write the failing type-test**

Create `packages/schemas/test/bridge-contract.test-d.ts`:

```ts
import { expectTypeOf, test } from "vitest";
import type { Asset, AssetRule, Bridge, BridgeRegistry, FeatureT, Provider } from "../src/index.js";

test("Bridge contract shapes", () => {
  const asset: Asset = { path: "UserCard.tsx", content: "export {}" };
  expectTypeOf(asset.path).toEqualTypeOf<string>();

  const rule: AssetRule = (a) => (a.content === "" ? ["empty"] : []);
  expectTypeOf(rule).parameter(0).toEqualTypeOf<Asset>();
  expectTypeOf(rule).returns.toEqualTypeOf<string[]>();

  const provider: Provider = {
    capability: "component",
    generate: (_f: FeatureT): Asset[] => [asset],
  };
  expectTypeOf(provider.generate).returns.toEqualTypeOf<Asset[]>();

  const registry: BridgeRegistry = {
    capabilities: ["component"],
    componentTypes: ["Card"],
    providerFor: (_c: string): Provider | undefined => provider,
  };

  const bridge: Bridge = {
    id: "astryx-react",
    platform: "react",
    registry,
    postRules: [rule],
  };
  expectTypeOf(bridge.registry).toEqualTypeOf<BridgeRegistry>();
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run: `pnpm --filter @boyscout/schemas typecheck`
Expected: FAIL — `Asset`, `AssetRule`, `Provider`, `BridgeRegistry`, `Bridge` are not exported.

- [ ] **Step 3: Add the interfaces**

Append to `packages/schemas/src/index.ts` (after `CapabilityContract`):

```ts
/** An emitted file before it is written to disk. `content` is raw at generate(), formatted after format(). */
export interface Asset {
  path: string;
  content: string;
}

/** A post-generation guardrail check over one asset. Returns violation messages ([] = pass). */
export type AssetRule = (asset: Asset) => string[];

/** Implements one capability: turns a feature into raw assets. Bridge-owned; never calls the Runtime. */
export interface Provider {
  readonly capability: string;
  generate(feature: FeatureT): Asset[];
}

/** The bridge's typed catalog: which capabilities and AST node types it can express, and the providers. */
export interface BridgeRegistry {
  readonly capabilities: readonly string[];
  readonly componentTypes: readonly string[];
  providerFor(capability: string): Provider | undefined;
}

/** A complete binding of a Platform to the Runtime. The Runtime consumes this by interface — never imports it. */
export interface Bridge {
  readonly id: string;
  readonly platform: string;
  readonly registry: BridgeRegistry;
  readonly postRules: readonly AssetRule[];
}
```

- [ ] **Step 4: Run typecheck to verify it passes**

Run: `pnpm --filter @boyscout/schemas typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/schemas/src/index.ts packages/schemas/test/bridge-contract.test-d.ts
git commit -m "feat(schemas): runtime<->bridge contracts (Asset, Provider, BridgeRegistry, Bridge)"
```

---

### Task 2: `@boyscout/codegen` — agnostic Eta engine

A single `render(template, data)` that runs Eta. Knows nothing about React/JSX. This is the whole `@boyscout/codegen` package.

**Files:**
- Create: `packages/codegen/package.json`, `packages/codegen/tsconfig.json`, `packages/codegen/src/index.ts`
- Test: `packages/codegen/test/render.test.ts`

**Interfaces:**
- Produces: `render(template: string, data: Record<string, unknown>): string` — consumed by Task 6.

- [ ] **Step 1: Scaffold the package**

Create `packages/codegen/package.json`:

```json
{
  "name": "@boyscout/codegen",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" }
}
```

Create `packages/codegen/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Then add Eta with an exact pin:

Run: `pnpm --filter @boyscout/codegen add -E eta`

- [ ] **Step 2: Write the failing test**

Create `packages/codegen/test/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { render } from "../src/index.js";

describe("render", () => {
  it("interpolates data via the `it` variable", () => {
    expect(render("Hi <%= it.name %>", { name: "Ada" })).toBe("Hi Ada");
  });

  it("does not HTML-escape (autoEscape off)", () => {
    expect(render("<%= it.jsx %>", { jsx: "<Card>&</Card>" })).toBe("<Card>&</Card>");
  });

  it("is deterministic for identical inputs", () => {
    const t = "a<%= it.x %>b";
    expect(render(t, { x: "1" })).toBe(render(t, { x: "1" }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/codegen/test/render.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement**

Create `packages/codegen/src/index.ts`:

```ts
import { Eta } from "eta";

// autoEscape off: output is source code, not HTML. autoTrim off: no whitespace surprises
// (final bytes are normalized by @boyscout/determinism format() downstream anyway).
const eta = new Eta({ autoEscape: false, autoTrim: false });

/** Run a dumb Eta template against `data` (referenced as `it` inside the template). */
export function render(template: string, data: Record<string, unknown>): string {
  return eta.renderString(template, data);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/codegen/test/render.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/codegen pnpm-lock.yaml
git commit -m "feat(codegen): agnostic Eta render engine"
```

---

### Task 3: `@boyscout/planner` — Specification → Execution Graph

Deterministic, sequential. One node per feature; ordering by byte-collation tie-break; graph serialized with `canonicalJson`.

**Files:**
- Create: `packages/planner/package.json`, `packages/planner/tsconfig.json`, `packages/planner/src/index.ts`
- Test: `packages/planner/test/plan.test.ts`

**Interfaces:**
- Consumes: `sortByBytes`, `canonicalJson` from `@boyscout/determinism`; `SpecificationT`, `ExecutionGraphT` from `@boyscout/schemas`.
- Produces: `plan(spec: SpecificationT): ExecutionGraphT`; `serializeGraph(graph: ExecutionGraphT): string` — consumed by Task 7.

- [ ] **Step 1: Scaffold the package**

Create `packages/planner/package.json`:

```json
{
  "name": "@boyscout/planner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/determinism": "workspace:*",
    "@boyscout/schemas": "workspace:*"
  }
}
```

Create `packages/planner/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/planner/test/plan.test.ts`:

```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { plan, serializeGraph } from "../src/index.js";

function spec(ids: string[]): SpecificationT {
  return {
    version: "1",
    features: ids.map((id) => ({
      id,
      capability: "component",
      tree: { type: "Card" },
      annotations: {},
      props: {},
      approved: true,
    })),
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("plan", () => {
  it("emits one node per feature", () => {
    const g = plan(spec(["a", "b"]));
    expect(g.nodes).toEqual([
      { id: "a", capability: "component" },
      { id: "b", capability: "component" },
    ]);
  });

  it("orders nodes by byte-collation, not spec order", () => {
    const g = plan(spec(["b", "a"]));
    expect(g.ordering).toEqual(["a", "b"]);
  });

  it("serializes deterministically", () => {
    const a = serializeGraph(plan(spec(["b", "a"])));
    const b = serializeGraph(plan(spec(["a", "b"])));
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/planner/test/plan.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement**

Create `packages/planner/src/index.ts`:

```ts
import { canonicalJson, sortByBytes } from "@boyscout/determinism";
import type { ExecutionGraphT, SpecificationT } from "@boyscout/schemas";

/** Convert a validated Specification into a deterministic Execution Graph (sequential; one node per feature). */
export function plan(spec: SpecificationT): ExecutionGraphT {
  const nodes = sortByBytes(
    spec.features.map((f) => ({ id: f.id, capability: f.capability })),
    (n) => n.id,
  );
  return { nodes, edges: [], ordering: nodes.map((n) => n.id) };
}

/** Canonical serialization of a graph — the only sanctioned path (D3a). */
export function serializeGraph(graph: ExecutionGraphT): string {
  return canonicalJson(graph);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/planner/test/plan.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/planner pnpm-lock.yaml
git commit -m "feat(planner): Specification -> deterministic Execution Graph"
```

---

### Task 4: `@boyscout/guardrails` — the double barrier

Pre-barrier `checkExpressible` (every AST node type must be in the registry catalog) and the post-barrier engine `checkAssets` (runs injected `AssetRule`s) plus a reusable `biomeLint` rule (pinned Biome, block on error/fatal).

**Files:**
- Create: `packages/guardrails/package.json`, `packages/guardrails/tsconfig.json`, `packages/guardrails/src/index.ts`, `packages/guardrails/src/biome-lint.ts`
- Test: `packages/guardrails/test/pre.test.ts`, `packages/guardrails/test/post.test.ts`

**Interfaces:**
- Consumes: `SpecificationT`, `GuardrailResultT`, `Asset`, `AssetRule` from `@boyscout/schemas`; `Biome` from `@biomejs/js-api/nodejs`.
- Produces: `checkExpressible(spec, allowedTypes): GuardrailResultT`; `checkAssets(assets, rules): GuardrailResultT`; `biomeLint: AssetRule` — consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Scaffold the package**

Create `packages/guardrails/package.json`:

```json
{
  "name": "@boyscout/guardrails",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/schemas": "workspace:*"
  }
}
```

Create `packages/guardrails/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Add the pinned Biome (match determinism's versions):

Run: `pnpm --filter @boyscout/guardrails add -E @biomejs/js-api@6.0.0 @biomejs/wasm-nodejs@2.5.3`

- [ ] **Step 2: Write the failing pre-barrier test**

Create `packages/guardrails/test/pre.test.ts`:

```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const ALLOWED = ["Card", "VStack", "Text"];

function spec(tree: SpecificationT["features"][number]["tree"]): SpecificationT {
  return {
    version: "1",
    features: [{ id: "f1", capability: "component", tree, annotations: {}, props: {}, approved: true }],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("checkExpressible (pre-barrier)", () => {
  it("passes when every node type is in the catalog", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Text" }] }), ALLOWED);
    expect(r).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 on an unknown component, recursively", () => {
    const r = checkExpressible(spec({ type: "Card", children: [{ type: "Blob" }] }), ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
    expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/guardrails/test/pre.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement the pre-barrier + engine**

Create `packages/guardrails/src/index.ts`:

```ts
import type { Asset, AssetRule, GuardrailResultT, SpecificationT } from "@boyscout/schemas";

export { biomeLint } from "./biome-lint.js";

interface TreeNode {
  type: string;
  children?: TreeNode[] | undefined;
}

function collectTypes(node: TreeNode, acc: string[]): void {
  acc.push(node.type);
  if (node.children) for (const child of node.children) collectTypes(child, acc);
}

function result(violations: string[]): GuardrailResultT {
  return { ok: violations.length === 0, violations, code: violations.length === 0 ? 200 : 422 };
}

/** Pre-barrier: every AST node type in every feature tree must exist in the bridge catalog. */
export function checkExpressible(spec: SpecificationT, allowedTypes: readonly string[]): GuardrailResultT {
  const allowed = new Set(allowedTypes);
  const violations: string[] = [];
  for (const feature of spec.features) {
    const types: string[] = [];
    collectTypes(feature.tree as TreeNode, types);
    for (const t of types) {
      if (!allowed.has(t)) violations.push(`feature ${feature.id}: unknown component "${t}"`);
    }
  }
  return result(violations);
}

/** Post-barrier engine: run every injected rule over every asset; any violation fails the gate (422). */
export function checkAssets(assets: readonly Asset[], rules: readonly AssetRule[]): GuardrailResultT {
  const violations: string[] = [];
  for (const asset of assets) {
    for (const rule of rules) violations.push(...rule(asset));
  }
  return result(violations);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/guardrails/test/pre.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing post/biomeLint test**

Create `packages/guardrails/test/post.test.ts`:

```ts
import type { Asset, AssetRule } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { biomeLint, checkAssets } from "../src/index.js";

const clean: Asset = {
  path: "Ok.tsx",
  content: 'export function Ok() {\n  return <span>hi</span>;\n}\n',
};

describe("checkAssets (post-barrier engine)", () => {
  it("passes when no rule reports a violation", () => {
    const noop: AssetRule = () => [];
    expect(checkAssets([clean], [noop])).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 when a rule reports a violation", () => {
    const always: AssetRule = (a) => [`${a.path}: nope`];
    const r = checkAssets([clean], [always]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
  });
});

describe("biomeLint rule", () => {
  it("passes clean code (no error/fatal diagnostics)", () => {
    expect(biomeLint(clean)).toEqual([]);
  });

  it("flags code with a lint error", () => {
    // `== null` style aside, a redeclared const is a hard parse/lint error.
    const broken: Asset = { path: "Bad.ts", content: "const x = 1;\nconst x = 2;\n" };
    expect(biomeLint(broken).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm exec vitest run packages/guardrails/test/post.test.ts`
Expected: FAIL — `biomeLint` not exported.

- [ ] **Step 8: Implement biomeLint** (mirrors SP1 `determinism/src/format.ts` hermetic pattern, but lints)

Create `packages/guardrails/src/biome-lint.ts`:

```ts
import { Biome } from "@biomejs/js-api/nodejs";
import type { ProjectKey } from "@biomejs/wasm-nodejs";
import type { Asset, AssetRule } from "@boyscout/schemas";

// Explicit in-memory config — hermetic, no ambient biome.json is ever read.
const CONFIG = {
  linter: { enabled: true, rules: { recommended: true } },
} as const;

let cached: { biome: Biome; projectKey: ProjectKey } | null = null;

function instance(): { biome: Biome; projectKey: ProjectKey } {
  if (cached) return cached;
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  biome.applyConfiguration(projectKey, CONFIG);
  cached = { biome, projectKey };
  return cached;
}

/** Post-barrier rule: lint an asset with the pinned Biome; report error/fatal diagnostics as violations. */
export const biomeLint: AssetRule = (asset: Asset): string[] => {
  const { biome, projectKey } = instance();
  const { diagnostics } = biome.lintContent(projectKey, asset.content, { filePath: asset.path });
  return diagnostics
    .filter((d) => d.severity === "error" || d.severity === "fatal")
    .map((d) => `${asset.path}: ${d.category ?? "lint"}`);
};
```

Note: if `tsc` rejects the `CONFIG` literal shape for `applyConfiguration`, cast at the call site as SP1 discovered may be needed: `biome.applyConfiguration(projectKey, CONFIG as never)`. Prefer no cast; add only if the compiler demands it.

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm exec vitest run packages/guardrails/test/post.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 10: Commit**

```bash
git add packages/guardrails pnpm-lock.yaml
git commit -m "feat(guardrails): pre-barrier (checkExpressible) + post-barrier (checkAssets, biomeLint)"
```

---

### Task 5: `@boyscout/spec` — validation & 422 gate

`validateSpec` = Zod shape-validation of `Specification` + the pre-barrier (`checkExpressible`). Returns a discriminated result.

**Files:**
- Create: `packages/spec/package.json`, `packages/spec/tsconfig.json`, `packages/spec/src/index.ts`
- Test: `packages/spec/test/validate.test.ts`

**Interfaces:**
- Consumes: `Specification`, `SpecificationT`, `GuardrailResultT` from `@boyscout/schemas`; `checkExpressible` from `@boyscout/guardrails`.
- Produces: `type ValidateResult = { ok: true; spec: SpecificationT } | GuardrailResultT`; `validateSpec(input: unknown, allowedTypes: readonly string[]): ValidateResult` — consumed by Task 7.

- [ ] **Step 1: Scaffold the package**

Create `packages/spec/package.json`:

```json
{
  "name": "@boyscout/spec",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/schemas": "workspace:*",
    "@boyscout/guardrails": "workspace:*"
  }
}
```

Create `packages/spec/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/spec/test/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/index.js";

const ALLOWED = ["Card", "Text"];

const good = {
  version: "1",
  features: [
    { id: "f1", capability: "component", tree: { type: "Card", children: [{ type: "Text" }] },
      annotations: {}, props: {}, approved: true },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

describe("validateSpec", () => {
  it("returns the parsed spec when shape and catalog are valid", () => {
    const r = validateSpec(good, ALLOWED);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.features[0]?.id).toBe("f1");
  });

  it("returns 422 when the shape is malformed", () => {
    const r = validateSpec({ version: 1 }, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(422);
  });

  it("returns 422 when a component is outside the catalog (pre-barrier)", () => {
    const bad = structuredClone(good);
    bad.features[0].tree.children = [{ type: "Blob" }];
    const r = validateSpec(bad, ALLOWED);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes("Blob"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/spec/test/validate.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement**

Create `packages/spec/src/index.ts`:

```ts
import { checkExpressible } from "@boyscout/guardrails";
import { Specification, type GuardrailResultT, type SpecificationT } from "@boyscout/schemas";

export type ValidateResult = { ok: true; spec: SpecificationT } | GuardrailResultT;

/** The 422 gate: Zod shape-validation, then the pre-generation barrier. Never emits. */
export function validateSpec(input: unknown, allowedTypes: readonly string[]): ValidateResult {
  const parsed = Specification.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      violations: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`),
      code: 422,
    };
  }
  const gate = checkExpressible(parsed.data, allowedTypes);
  if (!gate.ok) return gate;
  return { ok: true, spec: parsed.data };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/spec/test/validate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/spec pnpm-lock.yaml
git commit -m "feat(spec): validateSpec — Zod gate + pre-barrier (422)"
```

---

### Task 6: `@boyscout/bridge-astryx-react` — Registry, Provider, template, rules

The only package that knows Astryx. Maps `AstNode.type` → Astryx component 1:1, walks the tree in the Provider (recursion = logic, not in the template), renders via the Eta template, and contributes both guardrail barriers' bridge parts. Also updates the workspace globs so `packages/bridges/*` is picked up.

**Files:**
- Modify: `pnpm-workspace.yaml`, `vitest.config.ts`
- Create: `packages/bridges/bridge-astryx-react/package.json`, `.../tsconfig.json`
- Create: `.../src/catalog.ts`, `.../src/provider.ts`, `.../src/astryx-only.ts`, `.../src/index.ts`
- Create: `.../templates/component.tsx.eta`
- Test: `.../test/provider.test.ts`, `.../test/astryx-only.test.ts`, `.../test/registry-contract.test.ts`

**Interfaces:**
- Consumes: `render` from `@boyscout/codegen`; `biomeLint` from `@boyscout/guardrails`; `Asset`, `AstNodeT`, `Bridge`, `BridgeRegistry`, `FeatureT`, `Provider` from `@boyscout/schemas`; `byteCompare` from `@boyscout/determinism`; `ts` from `typescript`; `@astryxdesign/core`.
- Produces: `bridge: Bridge` (id `"astryx-react"`, platform `"react"`), `registry: BridgeRegistry`, `astryxOnly: AssetRule`, `COMPONENTS: readonly string[]` — consumed by Task 8, and the golden in Task 9.

- [ ] **Step 1: Extend the workspace globs**

Edit `pnpm-workspace.yaml` to:

```yaml
packages:
  - "packages/*"
  - "packages/bridges/*"
  - "apps/*"
```

Edit `vitest.config.ts` `include` to:

```ts
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
```

- [ ] **Step 2: Scaffold the package**

Create `packages/bridges/bridge-astryx-react/package.json`:

```json
{
  "name": "@boyscout/bridge-astryx-react",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/codegen": "workspace:*",
    "@boyscout/determinism": "workspace:*",
    "@boyscout/guardrails": "workspace:*",
    "@boyscout/schemas": "workspace:*"
  }
}
```

Create `packages/bridges/bridge-astryx-react/tsconfig.json` (note the **three**-level depth to the base):

```json
{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }
```

Add the external deps (Astryx pinned at the current release; `typescript` matched to root):

Run: `pnpm --filter @boyscout/bridge-astryx-react add -E @astryxdesign/core@0.1.4 typescript@5.9.3`
Then: `pnpm install`

- [ ] **Step 3: Write the failing provider test**

Create `packages/bridges/bridge-astryx-react/test/provider.test.ts`:

```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/provider.js";

const feature: FeatureT = {
  id: "user-card",
  capability: "component",
  tree: {
    type: "Card",
    children: [
      {
        type: "VStack",
        props: { gap: 2 },
        children: [
          { type: "Heading", props: { level: 3, text: "Profile" } },
          { type: "Text", props: { type: "body", text: "Hello" } },
        ],
      },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("componentProvider.generate", () => {
  it("emits one .tsx asset named PascalCase from the feature id", () => {
    const [asset, ...rest] = componentProvider.generate(feature);
    expect(rest).toHaveLength(0);
    expect(asset?.path).toBe("UserCard.tsx");
  });

  it("imports only the used components, byte-sorted, from @astryxdesign/core", () => {
    const [asset] = componentProvider.generate(feature);
    expect(asset?.content).toContain(
      'import { Card, Heading, Text, VStack } from "@astryxdesign/core";',
    );
  });

  it("renders props as JSX attributes (number={n}, string=\"s\") and `text` as the child", () => {
    const [asset] = componentProvider.generate(feature);
    expect(asset?.content).toContain("<VStack gap={2}>");
    expect(asset?.content).toContain('<Heading level={3}>Profile</Heading>');
    expect(asset?.content).toContain('<Text type="body">Hello</Text>');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/provider.test.ts`
Expected: FAIL — cannot resolve `../src/provider.js`.

- [ ] **Step 5: Implement the catalog**

Create `packages/bridges/bridge-astryx-react/src/catalog.ts`:

```ts
/** The SP2 Astryx catalog: AST node type === Astryx component name (1:1). Extend by adding rows. */
export const COMPONENTS = ["VStack", "HStack", "Card", "Grid", "Heading", "Text", "Button"] as const;

export const COMPONENT_SET: ReadonlySet<string> = new Set<string>(COMPONENTS);

/** Components whose `text` prop is rendered as the JSX child rather than an attribute. */
export const TEXT_CHILD: ReadonlySet<string> = new Set(["Heading", "Text", "Button"]);
```

- [ ] **Step 6: Implement the template**

Create `packages/bridges/bridge-astryx-react/templates/component.tsx.eta`:

```text
import { <%= it.imports %> } from "@astryxdesign/core";

export function <%= it.name %>() {
  return (
<%= it.body %>
  );
}
```

- [ ] **Step 7: Implement the provider**

Create `packages/bridges/bridge-astryx-react/src/provider.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import { byteCompare } from "@boyscout/determinism";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { TEXT_CHILD } from "./catalog.js";

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/component.tsx.eta", import.meta.url)),
  "utf8",
);

function toPascalCase(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function renderAttrs(props: Record<string, unknown>): string {
  const keys = Object.keys(props).filter((k) => k !== "text").sort(byteCompare);
  return keys
    .map((k) => {
      const v = props[k];
      return typeof v === "number" ? `${k}={${v}}` : `${k}="${String(v)}"`;
    })
    .join(" ");
}

function renderNode(node: AstNodeT): string {
  const props = node.props ?? {};
  const attrs = renderAttrs(props);
  const open = attrs ? `<${node.type} ${attrs}>` : `<${node.type}>`;
  let inner = "";
  if (TEXT_CHILD.has(node.type) && typeof props.text === "string") {
    inner = props.text;
  } else if (node.children) {
    inner = node.children.map(renderNode).join("");
  }
  return `${open}${inner}</${node.type}>`;
}

function collectTypes(node: AstNodeT, acc: Set<string>): void {
  acc.add(node.type);
  if (node.children) for (const c of node.children) collectTypes(c, acc);
}

export const componentProvider: Provider = {
  capability: "component",
  generate(feature: FeatureT): Asset[] {
    const used = new Set<string>();
    collectTypes(feature.tree, used);
    const imports = [...used].sort(byteCompare).join(", ");
    const name = toPascalCase(feature.id);
    const body = renderNode(feature.tree);
    const content = render(TEMPLATE, { imports, name, body });
    return [{ path: `${name}.tsx`, content }];
  },
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/provider.test.ts`
Expected: PASS (3 tests). (The provider output is raw/unformatted — the assertions match substrings, not whole-file layout. Formatting happens in the runtime.)

- [ ] **Step 9: Write the failing astryx-only test**

Create `packages/bridges/bridge-astryx-react/test/astryx-only.test.ts`:

```ts
import type { Asset } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { astryxOnly } from "../src/astryx-only.js";

describe("astryxOnly (post-barrier design-system rule)", () => {
  it("passes JSX using only Astryx (capitalized) components", () => {
    const ok: Asset = { path: "Ok.tsx", content: "export const A = () => <Card><Text>x</Text></Card>;" };
    expect(astryxOnly(ok)).toEqual([]);
  });

  it("flags a bare intrinsic element (<div>)", () => {
    const bad: Asset = { path: "Bad.tsx", content: "export const A = () => <div>x</div>;" };
    const v = astryxOnly(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toContain("div");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/astryx-only.test.ts`
Expected: FAIL — cannot resolve `../src/astryx-only.js`.

- [ ] **Step 11: Implement the astryx-only rule** (TS compiler AST — deterministic, no Astryx runtime needed)

Create `packages/bridges/bridge-astryx-react/src/astryx-only.ts`:

```ts
import type { Asset, AssetRule } from "@boyscout/schemas";
import ts from "typescript";

/** Post-barrier: emitted JSX must use only design-system (capitalized) components — no bare intrinsics. */
export const astryxOnly: AssetRule = (asset: Asset): string[] => {
  const source = ts.createSourceFile(asset.path, asset.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag)) violations.push(`${asset.path}: non-design-system element <${tag}>`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
};
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/astryx-only.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 13: Write the failing registry + contract test**

Create `packages/bridges/bridge-astryx-react/test/registry-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPONENTS } from "../src/catalog.js";
import { bridge, registry } from "../src/index.js";

describe("bridge registry", () => {
  it("declares the component capability and astryx-react identity", () => {
    expect(bridge.id).toBe("astryx-react");
    expect(bridge.platform).toBe("react");
    expect(registry.capabilities).toContain("component");
    expect(registry.providerFor("component")?.capability).toBe("component");
    expect(registry.providerFor("nope")).toBeUndefined();
  });

  it("carries both post-barrier rules (design-system + biome lint)", () => {
    expect(bridge.postRules.length).toBeGreaterThanOrEqual(2);
  });
});

describe("registry <-> @astryxdesign/core contract (§8.4)", () => {
  it("every catalog component is a real export of @astryxdesign/core", async () => {
    const mod = (await import("@astryxdesign/core")) as Record<string, unknown>;
    for (const name of COMPONENTS) {
      expect(mod[name], `${name} missing from @astryxdesign/core`).toBeDefined();
    }
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/registry-contract.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 15: Implement the bridge index**

Create `packages/bridges/bridge-astryx-react/src/index.ts`:

```ts
import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { astryxOnly } from "./astryx-only.js";
import { COMPONENTS } from "./catalog.js";
import { componentProvider } from "./provider.js";

export { COMPONENTS } from "./catalog.js";
export { astryxOnly } from "./astryx-only.js";

export const registry: BridgeRegistry = {
  capabilities: ["component"],
  componentTypes: COMPONENTS,
  providerFor: (capability) => (capability === "component" ? componentProvider : undefined),
};

export const bridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry,
  postRules: [astryxOnly, biomeLint],
};
```

- [ ] **Step 16: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/registry-contract.test.ts`
Expected: PASS (3 tests). If the `@astryxdesign/core` barrel import errors under Node due to an internal CSS import, confirm vitest is treating `.css` as an empty module (its default); no config change should be needed. If a specific component is not barrel-exported, adjust `COMPONENTS` to the names Astryx actually exports.

- [ ] **Step 17: Typecheck the whole workspace and commit**

Run: `pnpm typecheck`
Expected: PASS

```bash
git add packages/bridges pnpm-workspace.yaml vitest.config.ts pnpm-lock.yaml
git commit -m "feat(bridge-astryx-react): registry, component provider, dumb template, both barrier rules"
```

---

### Task 7: `@boyscout/runtime` — protocol orchestrator

`load → resolve → plan → validate → generate → format → verify → emit`, sequential, single capability. Never imports the bridge — takes it by interface. Includes the structural agnosticism guard test.

**Files:**
- Create: `packages/runtime/package.json`, `packages/runtime/tsconfig.json`, `packages/runtime/src/index.ts`
- Test: `packages/runtime/test/runtime.test.ts`, `packages/runtime/test/agnosticism.test.ts`

**Interfaces:**
- Consumes: `format`, `writeBytes`, `FormatLang` from `@boyscout/determinism`; `plan` from `@boyscout/planner`; `validateSpec` from `@boyscout/spec`; `checkAssets` from `@boyscout/guardrails`; `BoyscoutConfig`, `Asset`, `Bridge`, `BoyscoutConfigT`, `FeatureT` from `@boyscout/schemas`; `parse` from `yaml`.
- Produces: `loadConfig(yamlText: string): BoyscoutConfigT`; `buildAssets(opts): Asset[]`; `emit(assets, outDir): string[]`; `generate(opts): { emitted: string[] }`; `class GateError extends Error { violations: string[] }` — consumed by Task 8 and Task 9.

- [ ] **Step 1: Scaffold the package**

Create `packages/runtime/package.json` (NOTE: no bridge/astryx dependency — that is the invariant):

```json
{
  "name": "@boyscout/runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/determinism": "workspace:*",
    "@boyscout/guardrails": "workspace:*",
    "@boyscout/planner": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "@boyscout/spec": "workspace:*"
  }
}
```

Create `packages/runtime/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Add the YAML parser:

Run: `pnpm --filter @boyscout/runtime add -E yaml`

- [ ] **Step 2: Write the failing runtime test**

Create `packages/runtime/test/runtime.test.ts`:

```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Asset, Bridge, FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { GateError, buildAssets, generate, loadConfig } from "../src/index.js";

// A tiny fake bridge — proves the runtime consumes Bridge by interface, no Astryx import.
const fakeBridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry: {
    capabilities: ["component"],
    componentTypes: ["Card", "Text"],
    providerFor: (cap) =>
      cap === "component"
        ? {
            capability: "component",
            generate: (f: FeatureT): Asset[] => [
              { path: `${f.id}.tsx`, content: `export const ${f.id} = () => <Card><Text>hi</Text></Card>;` },
            ],
          }
        : undefined,
  },
  postRules: [(a) => (a.content.includes("<div") ? [`${a.path}: div`] : [])],
};

const config = loadConfig("platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n");

function spec(type = "Card") {
  return {
    version: "1",
    features: [
      { id: "widget", capability: "component", tree: { type, children: [{ type: "Text" }] },
        annotations: {}, props: {}, approved: true },
    ],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("loadConfig", () => {
  it("parses and validates boyscout.config.yaml", () => {
    expect(config.bridge).toBe("astryx-react");
    expect(config.capabilities).toEqual(["component"]);
  });
});

describe("buildAssets", () => {
  it("produces formatted assets for a valid spec", () => {
    const assets = buildAssets({ specInput: spec(), config, bridge: fakeBridge });
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe("widget.tsx");
    // Formatted by Biome: double quotes, trailing semicolon, final newline.
    expect(assets[0]?.content.endsWith("\n")).toBe(true);
  });

  it("throws GateError(422) at the pre-barrier for an unknown component", () => {
    try {
      buildAssets({ specInput: spec("Blob"), config, bridge: fakeBridge });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      expect((e as GateError).violations.some((v) => v.includes("Blob"))).toBe(true);
    }
  });
});

describe("generate", () => {
  it("emits assets to <outDir>/.running and returns the paths", () => {
    const outDir = mkdtempSync(join(tmpdir(), "boyscout-"));
    const { emitted } = generate({ specInput: spec(), config, bridge: fakeBridge, outDir });
    expect(emitted).toHaveLength(1);
    const written = readFileSync(join(outDir, ".running", "widget.tsx"), "utf8");
    expect(written).toContain("Card");
  });

  it("rejects an asset path that escapes .running", () => {
    const escaping: Bridge = {
      ...fakeBridge,
      registry: {
        ...fakeBridge.registry,
        providerFor: () => ({
          capability: "component",
          generate: (): Asset[] => [{ path: "../evil.tsx", content: "export const x = <Card/>;" }],
        }),
      },
    };
    const outDir = mkdtempSync(join(tmpdir(), "boyscout-"));
    expect(() => generate({ specInput: spec(), config, bridge: escaping, outDir })).toThrow(/traversal|\.\./);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run packages/runtime/test/runtime.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement the runtime**

Create `packages/runtime/src/index.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { format, type FormatLang, writeBytes } from "@boyscout/determinism";
import { checkAssets } from "@boyscout/guardrails";
import { plan } from "@boyscout/planner";
import { BoyscoutConfig, type Asset, type Bridge, type BoyscoutConfigT, type FeatureT } from "@boyscout/schemas";
import { validateSpec } from "@boyscout/spec";
import { parse as parseYaml } from "yaml";

/** Thrown when a guardrail barrier blocks the pipeline (HTTP-style 422). */
export class GateError extends Error {
  constructor(public readonly violations: string[]) {
    super(`gate failed (422): ${violations.join("; ")}`);
    this.name = "GateError";
  }
}

export interface BuildOpts {
  specInput: unknown;
  config: BoyscoutConfigT;
  bridge: Bridge;
}
export interface GenerateOpts extends BuildOpts {
  outDir: string;
}
export interface GenerateResult {
  emitted: string[];
}

/** load(): parse + validate boyscout.config.yaml. Fail-fast on invalid config. */
export function loadConfig(yamlText: string): BoyscoutConfigT {
  const parsed = BoyscoutConfig.safeParse(parseYaml(yamlText));
  if (!parsed.success) throw new Error(`invalid boyscout.config.yaml: ${parsed.error.message}`);
  return parsed.data;
}

const LANG_BY_EXT: Record<string, FormatLang> = {
  ".tsx": "tsx",
  ".ts": "ts",
  ".js": "js",
  ".json": "json",
  ".css": "css",
};

function langOf(path: string): FormatLang {
  const ext = path.slice(path.lastIndexOf("."));
  const lang = LANG_BY_EXT[ext];
  if (!lang) throw new Error(`no formatter for asset "${path}"`);
  return lang;
}

/** resolve() -> plan() -> validate() -> generate() -> format() -> verify(). Returns formatted assets; no emit. */
export function buildAssets(opts: BuildOpts): Asset[] {
  const { config, bridge } = opts;

  // resolve(): the loaded bridge must match the composition the config/spec declares.
  if (config.bridge !== bridge.id) {
    throw new Error(`config bridge "${config.bridge}" != loaded bridge "${bridge.id}"`);
  }

  // validate(): Zod gate + pre-barrier.
  const validated = validateSpec(opts.specInput, bridge.registry.componentTypes);
  if (!validated.ok) throw new GateError(validated.violations);
  const spec = validated.spec;

  if (spec.metadata.bridge !== bridge.id || spec.metadata.platform !== bridge.platform) {
    throw new Error(`spec metadata (${spec.metadata.bridge}/${spec.metadata.platform}) != bridge`);
  }

  // plan(): deterministic ordering.
  const graph = plan(spec);
  const featureById = new Map<string, FeatureT>(spec.features.map((f) => [f.id, f]));

  // generate() + format(), in graph order.
  const assets: Asset[] = [];
  for (const id of graph.ordering) {
    const feature = featureById.get(id);
    if (!feature) throw new Error(`graph node "${id}" has no feature`);
    const provider = bridge.registry.providerFor(feature.capability);
    if (!provider) throw new Error(`no provider for capability "${feature.capability}"`);
    for (const raw of provider.generate(feature)) {
      assets.push({ path: raw.path, content: format(raw.content, langOf(raw.path)) });
    }
  }

  // verify(): post-barrier.
  const gate = checkAssets(assets, bridge.postRules);
  if (!gate.ok) throw new GateError(gate.violations);

  return assets;
}

/** emit(): disposable write to <outDir>/.running via writeBytes (LF/UTF-8/no-BOM). Path-traversal shielded. */
export function emit(assets: readonly Asset[], outDir: string): string[] {
  const runningDir = join(outDir, ".running");
  const emitted: string[] = [];
  for (const asset of assets) {
    if (asset.path.includes("..") || normalize(asset.path) !== asset.path || asset.path.startsWith("/")) {
      throw new Error(`path traversal rejected: "${asset.path}"`);
    }
    const full = join(runningDir, asset.path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, writeBytes(asset.content));
    emitted.push(full);
  }
  return emitted;
}

/** The full protocol: build then emit. */
export function generate(opts: GenerateOpts): GenerateResult {
  const assets = buildAssets(opts);
  return { emitted: emit(assets, opts.outDir) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/runtime/test/runtime.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Write the failing agnosticism guard test**

Create `packages/runtime/test/agnosticism.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("agnosticism invariant (§14.1)", () => {
  it("the runtime package declares no bridge or framework dependency", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const leaks = deps.filter((d) => d.includes("astryx") || d.includes("bridge-"));
    expect(leaks, `runtime must not depend on a bridge/framework: ${leaks.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm exec vitest run packages/runtime/test/agnosticism.test.ts`
Expected: PASS (1 test) — the runtime package.json has only `@boyscout/{determinism,guardrails,planner,schemas,spec}` deps.

- [ ] **Step 8: Commit**

```bash
git add packages/runtime pnpm-lock.yaml
git commit -m "feat(runtime): sequential protocol (load->...->emit) + agnosticism guard"
```

---

### Task 8: `apps/cli` — `boyscout generate` (composition root)

The one place the bridge is imported and wired into the runtime. A thin `main(argv)` for testability plus a bin entry.

**Files:**
- Create: `apps/cli/package.json`, `apps/cli/tsconfig.json`, `apps/cli/src/main.ts`, `apps/cli/src/bin.ts`
- Test: `apps/cli/test/main.test.ts`

**Interfaces:**
- Consumes: `generate`, `loadConfig`, `GateError` from `@boyscout/runtime`; `bridge` from `@boyscout/bridge-astryx-react`.
- Produces: `main(argv: string[]): number` (exit code; 0 ok, 1 on 422/error).

- [ ] **Step 1: Scaffold the package**

Create `apps/cli/package.json`:

```json
{
  "name": "@boyscout/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "boyscout": "./src/bin.ts" },
  "exports": { ".": "./src/main.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@boyscout/bridge-astryx-react": "workspace:*",
    "@boyscout/runtime": "workspace:*"
  }
}
```

Create `apps/cli/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/cli/test/main.test.ts`:

```ts
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

function project(specTree: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "boyscout-cli-"));
  writeFileSync(join(dir, "boyscout.config.yaml"), "platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n");
  writeFileSync(
    join(dir, "boyscout-spec.json"),
    JSON.stringify({
      version: "1",
      features: [{ id: "user-card", capability: "component", tree: specTree, annotations: {}, props: {}, approved: true }],
      metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
    }),
  );
  return dir;
}

describe("boyscout generate (main)", () => {
  it("returns 0 and emits .running output for a valid spec", () => {
    const dir = project({ type: "Card", children: [{ type: "Text", props: { type: "body", text: "hi" } }] });
    const code = main(["generate", "--spec", join(dir, "boyscout-spec.json"), "--config", join(dir, "boyscout.config.yaml")]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, ".running", "UserCard.tsx"))).toBe(true);
  });

  it("returns 1 on a guardrail 422 (unknown component)", () => {
    const dir = project({ type: "Blob" });
    const code = main(["generate", "--spec", join(dir, "boyscout-spec.json"), "--config", join(dir, "boyscout.config.yaml")]);
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run apps/cli/test/main.test.ts`
Expected: FAIL — cannot resolve `../src/main.js`.

- [ ] **Step 4: Implement main**

Create `apps/cli/src/main.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { bridge } from "@boyscout/bridge-astryx-react";
import { GateError, generate, loadConfig } from "@boyscout/runtime";

function flag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}

/** `boyscout generate [--spec ./boyscout-spec.json] [--config ./boyscout.config.yaml]`. Returns an exit code. */
export function main(argv: string[]): number {
  const command = argv[0];
  if (command !== "generate") {
    process.stderr.write(`unknown command: ${command ?? "(none)"}\nusage: boyscout generate\n`);
    return 1;
  }
  const specPath = flag(argv, "--spec", "./boyscout-spec.json");
  const configPath = flag(argv, "--config", "./boyscout.config.yaml");

  try {
    const config = loadConfig(readFileSync(configPath, "utf8"));
    const specInput = JSON.parse(readFileSync(specPath, "utf8"));
    const { emitted } = generate({ specInput, config, bridge, outDir: dirname(specPath) });
    for (const path of emitted) process.stdout.write(`${path}\n`);
    return 0;
  } catch (err) {
    if (err instanceof GateError) {
      process.stderr.write(`422 gate failed:\n${err.violations.map((v) => `  - ${v}`).join("\n")}\n`);
    } else {
      process.stderr.write(`error: ${(err as Error).message}\n`);
    }
    return 1;
  }
}
```

- [ ] **Step 5: Implement the bin shim**

Create `apps/cli/src/bin.ts`:

```ts
#!/usr/bin/env node
import { main } from "./main.js";

process.exit(main(process.argv.slice(2)));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run apps/cli/test/main.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps pnpm-lock.yaml
git commit -m "feat(cli): boyscout generate — composition root wiring bridge into runtime"
```

---

### Task 9: Kill-gate — cross-OS golden + both-barrier negatives (end-to-end)

The SP2 deliverable: a hand-authored fixture spec → byte-identical emitted component, golden-tested on the CI matrix, plus explicit 422 proofs at both barriers. Uses the real `bridge` + `buildAssets` (no filesystem needed — hashes the bytes that would be written). Mirrors SP1's bootstrap-or-assert golden harness.

**Files:**
- Modify: `.gitignore`
- Create: `apps/cli/test/fixtures/spec.json`, `apps/cli/test/fixtures/config.yaml`
- Create: `apps/cli/test/goldens/UserCard.tsx`
- Test: `apps/cli/test/golden.test.ts`, `apps/cli/test/kill-gate.test.ts`

**Interfaces:**
- Consumes: `buildAssets`, `loadConfig`, `GateError` from `@boyscout/runtime`; `bridge` from `@boyscout/bridge-astryx-react`; `hash`, `writeBytes` from `@boyscout/determinism`.

- [ ] **Step 1: Ignore disposable output**

Append to `.gitignore`:

```text
.running/
```

- [ ] **Step 2: Create the fixture spec and config**

Create `apps/cli/test/fixtures/config.yaml`:

```yaml
platform: react
bridge: astryx-react
capabilities:
  - component
```

Create `apps/cli/test/fixtures/spec.json`:

```json
{
  "version": "1",
  "features": [
    {
      "id": "user-card",
      "capability": "component",
      "tree": {
        "type": "Card",
        "children": [
          {
            "type": "VStack",
            "props": { "gap": 2 },
            "children": [
              { "type": "Heading", "props": { "level": 3, "text": "Profile" } },
              { "type": "Text", "props": { "type": "body", "text": "Member since 2026" } },
              { "type": "Button", "props": { "variant": "primary", "text": "Edit" } }
            ]
          }
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

- [ ] **Step 3: Write the golden test (bootstrap-or-assert, like SP1)**

Create `apps/cli/test/golden.test.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: fixture spec -> byte-identical component", () => {
  it("emits UserCard.tsx matching the committed golden bytes", () => {
    const config = loadConfig(readFileSync(here("./fixtures/config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/spec.json"), "utf8"));
    const assets = buildAssets({ specInput, config, bridge });

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset?.path).toBe("UserCard.tsx");

    const actualBytes = writeBytes(asset?.content ?? "");
    const goldenPath = here("./goldens/UserCard.tsx");

    if (UPDATE) {
      writeFileSync(goldenPath, actualBytes);
      return;
    }
    const expectedBytes = readFileSync(goldenPath);
    // Compare hashes of the canonical bytes — the determinism thesis, proven per-OS in CI.
    expect(hash(actualBytes)).toBe(hash(new Uint8Array(expectedBytes)));
  });
});
```

- [ ] **Step 4: Bootstrap the golden, then verify it asserts**

Run: `UPDATE_GOLDENS=1 pnpm exec vitest run apps/cli/test/golden.test.ts`
Expected: PASS; creates `apps/cli/test/goldens/UserCard.tsx`.

Then run without the flag:

Run: `pnpm exec vitest run apps/cli/test/golden.test.ts`
Expected: PASS (asserts against the committed golden).

Open `apps/cli/test/goldens/UserCard.tsx` and confirm it is the expected Astryx component (imports byte-sorted `Button, Card, Heading, Text, VStack` from `@astryxdesign/core`; nested `<Card><VStack gap={2}>…`). This is the human-inspectable proof.

- [ ] **Step 5: Write the both-barrier kill-gate test**

Create `apps/cli/test/kill-gate.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { astryxOnly, bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { checkAssets } from "@boyscout/guardrails";
import { GateError, buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const config = loadConfig(readFileSync(here("./fixtures/config.yaml"), "utf8"));
const validSpec = JSON.parse(readFileSync(here("./fixtures/spec.json"), "utf8"));

describe("kill-gate: headless governance (both barriers)", () => {
  it("pre-barrier: an unknown component 422s at validate()", () => {
    const bad = structuredClone(validSpec);
    bad.features[0].tree = { type: "Blob" };
    try {
      buildAssets({ specInput: bad, config, bridge });
      expect.unreachable("should have thrown at the pre-barrier");
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      expect((e as GateError).violations.some((v) => v.includes("Blob"))).toBe(true);
    }
  });

  it("post-barrier: a violating asset 422s at verify()", () => {
    const violating = { path: "Bad.tsx", content: "export const Bad = () => <div>escaped</div>;\n" };
    const result = checkAssets([violating], bridge.postRules);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(422);
    expect(astryxOnly(violating).length).toBeGreaterThan(0);
  });

  it("determinism: the same fixture builds byte-identical output twice", () => {
    const once = buildAssets({ specInput: validSpec, config, bridge });
    const twice = buildAssets({ specInput: validSpec, config, bridge });
    expect(hash(writeBytes(once[0]?.content ?? ""))).toBe(hash(writeBytes(twice[0]?.content ?? "")));
  });
});
```

- [ ] **Step 6: Run the kill-gate test**

Run: `pnpm exec vitest run apps/cli/test/kill-gate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm test`
Expected: PASS (all SP1 + SP2 tests)

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm format:check && pnpm lint`
Expected: PASS (fix any formatting with `pnpm format`; goldens are ignored by biome per SP1 config).

- [ ] **Step 8: Commit**

```bash
git add apps/cli/test .gitignore
git commit -m "test(sp2): cross-OS golden + both-barrier kill-gate proof"
```

---

## Self-Review

**1. Spec coverage** (against `2026-07-11-sp2-headless-declarative-generation-design.md`):

- `@boyscout/spec` (validateSpec + 422) → Task 5. ✓
- `@boyscout/planner` (byte-collation ordering, canonicalJson) → Task 3. ✓
- `@boyscout/codegen` (agnostic Eta) → Task 2. ✓
- `@boyscout/guardrails` (pre `checkExpressible` + post `checkAssets`/`biomeLint`) → Task 4. ✓
- `@boyscout/runtime` (8-stage sequential protocol, disposable emit, path shield) → Task 7. ✓
- `@boyscout/bridge-astryx-react` (Registry, 1:1 catalog, Provider tree-walk, dumb Eta template, both barrier rule parts, contract test) → Task 6. ✓
- `apps/cli` (`boyscout generate`, composition root) → Task 8. ✓
- Determinism integration (all serialize/sort/format/write via SP1) → Tasks 3, 6, 7, 9. ✓
- Agnosticism invariant (runtime has no astryx/bridge dep, structural test) → Task 7. ✓
- Cross-OS golden (thesis) → Task 9 (runs on SP1's existing matrix; goldens byte-compared via `hash`). ✓
- Both-barrier 422 negatives (governance) → Task 9 + unit coverage in Tasks 4/5/6. ✓
- Registry contract test (§8.4, catalog ⊆ `@astryxdesign/core` exports) → Task 6. ✓
- Shared runtime↔bridge contracts → Task 1. ✓
- Deferred (SP3+): logic-bearing/durable seam, parallel exec, DSL/preview/daemon, Material bridge, lockfile — none built here. ✓

No gaps.

**2. Placeholder scan:** No TBD/TODO. Every code step contains complete code; every test step contains real assertions; external dep versions are set via `pnpm add -E` (real, resolvable pins) rather than invented literals.

**3. Type consistency:** `Asset { path, content }`, `AssetRule = (Asset) => string[]`, `Provider.generate(FeatureT): Asset[]`, `BridgeRegistry.componentTypes`, `Bridge.postRules` — defined in Task 1, consumed identically in Tasks 4/6/7/8/9. `buildAssets`/`emit`/`generate`/`loadConfig`/`GateError` defined in Task 7, consumed identically in Tasks 8/9. `checkExpressible`/`checkAssets`/`biomeLint` names consistent across Tasks 4/5/6/7. `plan`/`serializeGraph` (Task 3) consumed in Task 7. `render` (Task 2) consumed in Task 6. `astryxOnly`/`bridge`/`registry`/`COMPONENTS` (Task 6) consumed in Tasks 8/9. Consistent throughout.

## Notes for the executor

- **Cross-package raw-TS imports:** packages expose `"exports": { ".": "./src/index.ts" }` (SP1 pattern). `@boyscout/*` imports resolve through the workspace symlink to that TS entry under NodeNext. If `tsc` or vitest fails to resolve a workspace import, run `pnpm install` first (links the workspace) — do not switch to relative cross-package paths.
- **The CI matrix already exists** (`.github/workflows/ci.yml`, SP1) and runs `pnpm test` + typecheck + format:check + lint on `{ubuntu, macos, windows} × node20`. SP2's golden and negative tests are ordinary Vitest tests, so they run cross-OS automatically — no workflow edit is needed. The cross-OS byte-identity proof is the golden test passing on all three legs.
- **Astryx version:** Task 6 pins `@astryxdesign/core@0.1.4` (current release). If a newer release is out at execution time, pin that exact version and let the registry contract test confirm the catalog still resolves.
