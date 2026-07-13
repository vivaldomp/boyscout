# SP4b — Authoring Front-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An author edits `.openui` in the browser, sees a live high-fidelity Astryx/React preview, approves each feature, and commits — producing a canonical `boyscout-spec.json` (+ lockstep `.openui`) on disk that the existing `boyscout generate` drives to byte-identical scaffolds.

**Architecture:** A generic agnostic `@boyscout/renderer` (AST→React, component map injected) + an Astryx component map and Vite React SPA in `apps/boyscout-ui` + a bridge-agnostic Hono authoring daemon in `apps/cli` (`boyscout author`) that parses/validates/persists and never runs generation. The daemon carries §21 security. Two SP4a carry-forwards fold in: `.openui` `writeBytes` (+ cross-OS golden) and logic-bearing codegen safety (identifier guard + string-literal escaping).

**Tech Stack:** TypeScript 5.9.3 (strict), React 19.2.7, `@astryxdesign/core` 0.1.4 (StyleX, precompiled), Vite 8, Hono + `@hono/node-server`, `@playwright/test`, Vitest 4, Zod 4, Eta, pnpm workspaces.

## Global Constraints

- **Strict TS everywhere** (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `noEmit`, NodeNext/ES2022. Index access is `T | undefined` — narrow before use.
- **Raw-TS packages** (no build): `exports` point at `./src/index.ts`. Only `apps/boyscout-ui` has a build step (Vite → `apps/boyscout-ui/dist/`).
- **Determinism (D3a/D3b):** every byte written to disk goes through `@boyscout/determinism` `writeBytes` (LF/UTF-8/no-BOM). Persisted `spec.json` = `writeBytes(canonicalJson(spec))`; persisted `.openui` = `writeBytes(serializeOpenui(spec, registry))`. No `Date.now`/`Math.random` in generation/persistence.
- **Session token exception (§21):** the CSPRNG session token uses `node:crypto` `randomBytes` — the "no OS randomness" rule is scoped to generation/ID derivation only, never the token.
- **§21 security (exact behavior):** `/api/*` require `Authorization: Bearer <token>` (else **401**) and reject a present `Origin` header ≠ the daemon's own origin (**403**); default bind `127.0.0.1`, `0.0.0.0` only via explicit `--host`; disk writes path-shielded to the project root (reject `..` escape); static serving shielded to the SPA `dist/`.
- **Agnosticism (§14.1):** `@boyscout/renderer` imports no bridge/design-system; the daemon imports the bridge **registry only** (never providers/Runtime/react); `bridge-astryx-react` stays react-free; only `apps/boyscout-ui` imports react + Astryx.
- **Stage separation (§1.2/D1):** the authoring daemon produces `spec.json` and NEVER imports `@boyscout/runtime`; `boyscout generate` (existing CLI) consumes it.
- **Safe-identifier rule (logic-bearing):** governed `name` props on `service`/`store`/`http` features (root + `Method`/`Action`/`Endpoint` children) must match `/^[A-Za-z][A-Za-z0-9]*$/`; rejected at the 422 pre-barrier. Free-form seam type-text (`params`, `returns`, `payload`, `state`, `response`) is NOT escaped — it is the typed seam contract, governed lint-level (D2d) by biome/tsc.
- **String-literal escaping:** authored string *values* interpolated into a JS/TS string literal (http `path`, `method`) are emitted via `JSON.stringify`, never raw-quoted.
- **New dependencies** (require registry access): `hono`, `@hono/node-server` (Task 3); `@playwright/test` (Task 7). `react`/`react-dom`/`vite`/`@astryxdesign/core`/`@stylexjs/stylex` are already in the store. If a `pnpm add` cannot reach the registry, STOP and report BLOCKED — do not vendor by hand.
- **Test commands:** run tests with `npx vitest run <path>` (no per-package `test` script exists); typecheck with `pnpm --filter <pkg> typecheck` and, before final commit of a task, `pnpm -r typecheck`. Playwright runs via `npx playwright test` from `apps/boyscout-ui`.

---

### Task 1: `@boyscout/renderer` — generic AST → React

**Files:**
- Create: `packages/renderer/package.json`
- Create: `packages/renderer/tsconfig.json`
- Create: `packages/renderer/src/renderer.ts`
- Create: `packages/renderer/src/index.ts`
- Test: `packages/renderer/test/renderer.test.ts`

**Interfaces:**
- Consumes: `AstNodeT` from `@boyscout/schemas` (`{ type: string; props?: Record<string, unknown>; children?: AstNodeT[] }`).
- Produces:
  - `type NodeComponent = (props: { node: AstNodeT; children?: ReactNode }) => ReactElement`
  - `type ComponentMap = Record<string, NodeComponent>`
  - `function Renderer(props: { ast: AstNodeT; components: ComponentMap }): ReactElement`
  - Unknown node type → a `<div data-unknown-node="<type>">⟨<type>⟩…children</div>` fallback (never throws).

- [ ] **Step 1: Create the package manifest**

`packages/renderer/package.json`:
```json
{
  "name": "@boyscout/renderer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "peerDependencies": {
    "react": ">=19.0.0"
  },
  "dependencies": {
    "@boyscout/schemas": "workspace:*"
  },
  "devDependencies": {
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.7",
    "typescript": "5.9.3"
  }
}
```

`packages/renderer/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/renderer/test/renderer.test.ts` (no JSX — uses `createElement`, runs in Vitest's node env via `react-dom/server`):
```ts
import type { AstNodeT } from "@boyscout/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Renderer, type ComponentMap } from "../src/index.js";

const mock: ComponentMap = {
  Card: ({ children }) => createElement("section", { "data-c": "card" }, children),
  VStack: ({ node, children }) =>
    createElement("div", { "data-c": "vstack", "data-gap": String(node.props?.gap ?? "") }, children),
  Text: ({ node }) => createElement("p", null, String(node.props?.text ?? "")),
};

const render = (ast: AstNodeT) =>
  renderToStaticMarkup(createElement(Renderer, { ast, components: mock }));

describe("Renderer", () => {
  it("mounts mapped components, passes props, and nests children in order", () => {
    const ast: AstNodeT = {
      type: "Card",
      children: [
        {
          type: "VStack",
          props: { gap: 2 },
          children: [
            { type: "Text", props: { text: "one" } },
            { type: "Text", props: { text: "two" } },
          ],
        },
      ],
    };
    expect(render(ast)).toBe(
      '<section data-c="card"><div data-c="vstack" data-gap="2"><p>one</p><p>two</p></div></section>',
    );
  });

  it("renders a visible fallback for an unknown node type without throwing", () => {
    const ast: AstNodeT = { type: "Card", children: [{ type: "Mystery" }] };
    expect(render(ast)).toBe(
      '<section data-c="card"><div data-unknown-node="Mystery">⟨Mystery⟩</div></section>',
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/renderer/test/renderer.test.ts`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 4: Write the renderer**

`packages/renderer/src/renderer.ts`:
```ts
import type { AstNodeT } from "@boyscout/schemas";
import { createElement, type ReactElement, type ReactNode } from "react";

/** A component that renders one AST node. It reads its own `node.props`; the walker hands it rendered `children`. */
export type NodeComponent = (props: { node: AstNodeT; children?: ReactNode }) => ReactElement;

/** node type -> component. Injected by the caller (bridge-specific); the renderer stays agnostic. */
export type ComponentMap = Record<string, NodeComponent>;

function renderNode(node: AstNodeT, components: ComponentMap, key: number): ReactElement {
  const kids = (node.children ?? []).map((c, i) => renderNode(c, components, i));
  const Comp = components[node.type];
  if (!Comp) {
    return createElement(
      "div",
      { key, "data-unknown-node": node.type },
      `⟨${node.type}⟩`,
      ...kids,
    );
  }
  return createElement(Comp, { key, node }, kids.length > 0 ? kids : undefined);
}

/** Walk a generic AST and mount the injected component for each node. Pure: same (ast, map) -> same tree. */
export function Renderer(props: { ast: AstNodeT; components: ComponentMap }): ReactElement {
  return renderNode(props.ast, props.components, 0);
}
```

`packages/renderer/src/index.ts`:
```ts
export { Renderer, type ComponentMap, type NodeComponent } from "./renderer.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/renderer/test/renderer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @boyscout/renderer typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/renderer
git commit -m "feat(renderer): generic agnostic AST -> React walker with injected component map"
```

---

### Task 2: Logic-bearing codegen safety (identifier guard + string-literal escaping)

**Files:**
- Modify: `packages/guardrails/src/index.ts` (add identifier check inside `checkExpressible`)
- Modify: `packages/bridges/bridge-astryx-react/src/http-provider.ts` (emit `path`/`method` as JS string literals)
- Modify: `packages/bridges/bridge-astryx-react/templates/http.ts.eta` (consume pre-quoted literals)
- Test: `packages/guardrails/test/safe-identifier.test.ts`
- Test: `packages/bridges/bridge-astryx-react/test/http-escape.test.ts`

**Interfaces:**
- Consumes: `checkExpressible(spec, registry)` (existing pre-barrier, returns `GuardrailResultT`), `httpProvider.generate(feature)` (existing).
- Produces: `checkExpressible` additionally rejects (422) any `service`/`store`/`http` feature whose root or governed-child `name` prop fails `/^[A-Za-z][A-Za-z0-9]*$/`; `httpProvider` emits `path`/`method` via `JSON.stringify`.

- [ ] **Step 1: Write the failing guard test**

`packages/guardrails/test/safe-identifier.test.ts`:
```ts
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
    expect(r.violations.some((v) => v.includes("unsafe identifier") && v.includes("Bad Name"))).toBe(true);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run packages/guardrails/test/safe-identifier.test.ts`
Expected: FAIL — the "rejects…" cases return `ok: true` (no guard yet).

- [ ] **Step 3: Add the identifier guard to `checkExpressible`**

In `packages/guardrails/src/index.ts`, add this constant near `CHILD_TYPE`:
```ts
const SAFE_IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
/** Governed node types whose `name` prop becomes a TS identifier / path segment and must be a safe identifier. */
const GOVERNED_NAME_NODES: Record<string, ReadonlySet<string>> = {
  service: new Set(["Service", "Method"]),
  store: new Set(["Store", "Action"]),
  http: new Set(["Http", "Endpoint"]),
};
```
Then, inside the `for (const feature of spec.features)` loop, AFTER the existing zero-child block, add:
```ts
    const governed = GOVERNED_NAME_NODES[feature.capability];
    if (governed) {
      const checkName = (node: TreeNode): void => {
        if (governed.has(node.type)) {
          const name = (node as { props?: Record<string, unknown> }).props?.name;
          if (typeof name !== "string" || !SAFE_IDENT.test(name)) {
            violations.push(
              `feature ${feature.id}: ${node.type} has unsafe identifier name ${JSON.stringify(name)}`,
            );
          }
        }
        if (node.children) for (const c of node.children) checkName(c);
      };
      checkName(feature.tree as TreeNode);
    }
```
Note: `TreeNode` (already declared in this file) has no `props`; the `as { props?… }` cast reads it locally without widening the shared type.

- [ ] **Step 4: Run the guard test to verify it passes**

Run: `npx vitest run packages/guardrails/test/safe-identifier.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing http-escape test**

`packages/bridges/bridge-astryx-react/test/http-escape.test.ts`:
```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { httpProvider } from "../src/http-provider.js";

function httpFeature(path: string, method: string): FeatureT {
  return {
    id: "api",
    capability: "http",
    tree: {
      type: "Http",
      props: { name: "Api" },
      children: [{ type: "Endpoint", props: { name: "getX", method, path, response: "unknown" } }],
    },
    annotations: {},
    props: {},
    approved: true,
  };
}

describe("http-provider string-literal escaping", () => {
  it("emits a clean path/method byte-identically to a hand-quoted literal", () => {
    const scaffold = httpProvider.generate(httpFeature("/users", "GET")).find((a) => !a.durable);
    expect(scaffold?.content).toContain('fetch("/users", { method: "GET" })');
  });

  it("escapes a quote/newline in path into a valid JS string literal (no raw breakout)", () => {
    const scaffold = httpProvider.generate(httpFeature('/a"b\nc', "GET")).find((a) => !a.durable);
    expect(scaffold?.content).toContain('fetch("/a\\"b\\nc"');
    expect(scaffold?.content).not.toContain('/a"b'); // the raw unescaped form must not appear
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/http-escape.test.ts`
Expected: FAIL — the escape case leaves a raw `"` (template currently wraps `<%= e.path %>` in its own quotes).

- [ ] **Step 7: Emit `path`/`method` as pre-quoted literals**

In `packages/bridges/bridge-astryx-react/src/http-provider.ts`, change `endpointsOf` to add literal fields (keep `method`/`path` for any other use):
```ts
interface Endpoint {
  name: string;
  method: string;
  path: string;
  pathLiteral: string;
  methodLiteral: string;
  response: string;
}

function endpointsOf(tree: AstNodeT): Endpoint[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Endpoint")
    .map((c) => {
      const p = c.props ?? {};
      const method = String(p.method ?? "GET");
      const path = String(p.path ?? "/");
      return {
        name: String(p.name ?? ""),
        method,
        path,
        pathLiteral: JSON.stringify(path),
        methodLiteral: JSON.stringify(method),
        response: String(p.response ?? "unknown"),
      };
    });
}
```

In `packages/bridges/bridge-astryx-react/templates/http.ts.eta`, change the fetch line from:
```
    const res = await fetch("<%= e.path %>", { method: "<%= e.method %>" });
```
to (note: no surrounding quotes — the literal carries them):
```
    const res = await fetch(<%= e.pathLiteral %>, { method: <%= e.methodLiteral %> });
```

- [ ] **Step 8: Run the http-escape test to verify it passes**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/http-escape.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Run the full suite — no golden drift, no regressions**

Run: `npx vitest run`
Expected: PASS all (clean `/users`/`GET` produce byte-identical output → existing http golden unchanged; SP3/SP4a logic-bearing fixtures use clean identifiers → the new guard does not reject them). If any golden drifts, STOP and investigate — do NOT run `golden:update`.

- [ ] **Step 10: Typecheck + commit**

Run: `pnpm --filter @boyscout/guardrails typecheck && pnpm --filter @boyscout/bridge-astryx-react typecheck`
Expected: no errors.
```bash
git add packages/guardrails/src/index.ts packages/guardrails/test/safe-identifier.test.ts \
        packages/bridges/bridge-astryx-react/src/http-provider.ts \
        packages/bridges/bridge-astryx-react/templates/http.ts.eta \
        packages/bridges/bridge-astryx-react/test/http-escape.test.ts
git commit -m "feat(guardrails,astryx): reject unsafe logic-bearing identifiers; escape http path/method literals"
```

---

### Task 3: Authoring daemon core — Hono app factory, security, parse/approve

**Files:**
- Modify: `apps/cli/package.json` (add `hono`, `@hono/node-server`, `@boyscout/dialect`, `@boyscout/spec`, `@boyscout/determinism`, `@boyscout/schemas`)
- Create: `apps/cli/src/author/app.ts`
- Test: `apps/cli/test/author-app.test.ts`

**Interfaces:**
- Consumes: `parseOpenui`, `serializeOpenui`, `DialectError`, `DialectRegistry` from `@boyscout/dialect`; `canonicalJson`, `hash`, `writeBytes` from `@boyscout/determinism`; `SpecificationT` from `@boyscout/schemas`.
- Produces:
  - `interface AuthAppOptions { registry: DialectRegistry; token: string; selfOrigin: string; initialOpenui: string; specPath: string; openuiPath: string; projectRoot: string }`
  - `function createAuthApp(opts: AuthAppOptions): { app: Hono; snapshot: () => AuthState }`
  - `interface AuthState { openui: string; ast: SpecificationT | null; approvals: Record<string, boolean>; errors: { line: number; message: string }[] }`
  - Routes (all `/api/*` guarded): `GET /api/state`, `POST /api/parse {text}`, `POST /api/approve {featureId,approved}`, `POST /api/commit`.
  - Commit gate + writing live in Task 4 (this task ships parse/approve + security; commit is added next).

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @boyscout/cli add hono @hono/node-server
pnpm --filter @boyscout/cli add @boyscout/dialect@workspace:* @boyscout/spec@workspace:* @boyscout/determinism@workspace:* @boyscout/schemas@workspace:*
```
(If offline, STOP — BLOCKED.) Confirm `apps/cli/package.json` now lists `hono`, `@hono/node-server`, and the four workspace deps.

- [ ] **Step 2: Write the failing security + parse/approve test**

`apps/cli/test/author-app.test.ts`:
```ts
import { registry } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { createAuthApp } from "../src/author/app.js";

const TOKEN = "test-token";
const ORIGIN = "http://127.0.0.1:4517";
const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make() {
  return createAuthApp({
    registry,
    token: TOKEN,
    selfOrigin: ORIGIN,
    initialOpenui: OPENUI,
    specPath: "/tmp/x/boyscout-spec.json",
    openuiPath: "/tmp/x/boyscout.openui",
    projectRoot: "/tmp/x",
  });
}
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("author daemon: security", () => {
  it("rejects /api without a token (401)", async () => {
    const { app } = make();
    const res = await app.request("/api/state");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token (401)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  it("rejects a foreign Origin (403)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: { ...auth, Origin: "http://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("allows a valid token with matching Origin", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: { ...auth, Origin: ORIGIN } });
    expect(res.status).toBe(200);
  });
});

describe("author daemon: parse + approve", () => {
  it("loads initial openui and starts every feature as draft (unapproved)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: auth });
    const body = await res.json();
    expect(body.errors).toEqual([]);
    expect(body.ast.features).toHaveLength(1);
    expect(body.approvals).toEqual({ card: false });
  });

  it("returns line-numbered errors for bad openui and keeps the last good ast", async () => {
    const { app } = make();
    const res = await app.request("/api/parse", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ text: 'component bad =\n  Card {\n    Text("body", "x)\n  }' }),
    });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors[0].line).toBeGreaterThan(0);
    // last good ast preserved:
    const state = await (await app.request("/api/state", { headers: auth })).json();
    expect(state.ast.features).toHaveLength(1);
  });

  it("approve flips a feature; a re-parse that changes it resets to draft", async () => {
    const { app } = make();
    await app.request("/api/approve", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ featureId: "card", approved: true }),
    });
    let state = await (await app.request("/api/state", { headers: auth })).json();
    expect(state.approvals.card).toBe(true);

    // edit the card feature -> its signature changes -> approval resets
    await app.request("/api/parse", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ text: OPENUI.replace('"hello"', '"changed"') }),
    });
    state = await (await app.request("/api/state", { headers: auth })).json();
    expect(state.approvals.card).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run apps/cli/test/author-app.test.ts`
Expected: FAIL — `Cannot find module '../src/author/app.js'`.

- [ ] **Step 4: Write the app factory (parse/approve + security; commit stub)**

`apps/cli/src/author/app.ts`:
```ts
import { Hono } from "hono";
import { canonicalJson, hash } from "@boyscout/determinism";
import { DialectError, type DialectRegistry, parseOpenui } from "@boyscout/dialect";
import type { SpecificationT } from "@boyscout/schemas";

export interface AuthAppOptions {
  registry: DialectRegistry;
  token: string;
  selfOrigin: string;
  initialOpenui: string;
  /** Absolute, pre-resolved write targets (path-shielded at commit). */
  specPath: string;
  openuiPath: string;
  /** Absolute project root; commit writes must stay within it. */
  projectRoot: string;
}

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
}

export function createAuthApp(opts: AuthAppOptions): { app: Hono; snapshot: () => AuthState } {
  const { registry, token, selfOrigin } = opts;
  let openui = opts.initialOpenui;
  let spec: SpecificationT | null = null;
  let errors: { line: number; message: string }[] = [];
  let approvals: Record<string, boolean> = {};
  let sigs: Record<string, string> = {};

  function reparse(text: string): void {
    try {
      const next = parseOpenui(text, registry);
      const nextApprovals: Record<string, boolean> = {};
      const nextSigs: Record<string, string> = {};
      for (const f of next.features) {
        const s = hash(canonicalJson(f.tree));
        nextSigs[f.id] = s;
        // carry approval only if this feature is byte-identical to the last good parse
        nextApprovals[f.id] = sigs[f.id] === s ? (approvals[f.id] ?? false) : false;
      }
      openui = text;
      spec = next;
      approvals = nextApprovals;
      sigs = nextSigs;
      errors = [];
    } catch (e) {
      errors = [{ line: e instanceof DialectError ? e.line : 0, message: (e as Error).message }];
      // keep the last good spec/approvals/sigs; update the visible text so the editor shows what was typed
      openui = text;
    }
  }
  // initial load: try to parse, but always retain the initial text even if it fails
  reparse(opts.initialOpenui);
  openui = opts.initialOpenui;

  const snapshot = (): AuthState => ({ openui, ast: spec, approvals, errors });

  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && origin !== selfOrigin) return c.json({ error: "forbidden origin" }, 403);
    if (c.req.header("Authorization") !== `Bearer ${token}`) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/api/state", (c) => c.json(snapshot()));

  app.post("/api/parse", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    reparse(typeof body.text === "string" ? body.text : "");
    return c.json({ ok: errors.length === 0, ast: spec, errors });
  });

  app.post("/api/approve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { featureId?: unknown; approved?: unknown };
    const id = typeof body.featureId === "string" ? body.featureId : "";
    if (id in approvals) approvals[id] = body.approved === true;
    return c.json({ approvals });
  });

  // commit route added in Task 4 (needs writeBytes + path shielding)
  registerCommit(app, opts, () => spec, () => approvals, registry);

  return { app, snapshot };
}
```

Add a temporary no-op `registerCommit` at the bottom of the file so the module compiles this task (Task 4 replaces it with the real implementation, moved to `commit.ts`):
```ts
// TEMPORARY — replaced in Task 4 by ./commit.ts
function registerCommit(
  _app: Hono,
  _opts: AuthAppOptions,
  _getSpec: () => SpecificationT | null,
  _getApprovals: () => Record<string, boolean>,
  _registry: DialectRegistry,
): void {}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/cli/test/author-app.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @boyscout/cli typecheck`
Expected: no errors.
```bash
git add apps/cli/package.json apps/cli/src/author/app.ts apps/cli/test/author-app.test.ts pnpm-lock.yaml
git commit -m "feat(cli): author daemon core — Hono app, session-token + origin guard, parse/approve draft overlay"
```

---

### Task 4: Daemon commit + `boyscout author` command + `.openui` cross-OS golden

**Files:**
- Create: `apps/cli/src/author/commit.ts` (real commit route: gate → writeBytes → path-shielded write)
- Modify: `apps/cli/src/author/app.ts` (import the real `registerCommit`, delete the temp stub)
- Create: `apps/cli/src/author/command.ts` (`authorCommand`: flags, token, static serving, `serve()`)
- Modify: `apps/cli/src/main.ts` (route the `author` subcommand)
- Test: `apps/cli/test/author-commit.test.ts`
- Test: `apps/cli/test/openui-golden.test.ts`
- Golden: `apps/cli/test/goldens/openui/canonical.openui`

**Interfaces:**
- Consumes: `AuthAppOptions`, the spec/approvals getters from Task 3; `serializeOpenui`, `DialectRegistry` from `@boyscout/dialect`; `canonicalJson`, `writeBytes` from `@boyscout/determinism`.
- Produces:
  - `function registerCommit(app: Hono, opts: AuthAppOptions, getSpec: () => SpecificationT | null, getApprovals: () => Record<string, boolean>, registry: DialectRegistry): void`
  - `POST /api/commit` → 422 `{ok:false, violations}` if any feature unapproved or no valid spec; else writes `spec.json` + `.openui` (both via `writeBytes`, path-shielded) → `{ok:true, written:[specPath, openuiPath]}`.
  - `function authorCommand(argv: string[]): number` — `boyscout author --openui <f> [--spec <f>] [--host] [--port] [--ui-dist <dir>]`.

- [ ] **Step 1: Write the failing commit test**

`apps/cli/test/author-commit.test.ts`:
```ts
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry } from "@boyscout/bridge-astryx-react";
import { canonicalJson, hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui } from "@boyscout/dialect";
import { describe, expect, it } from "vitest";
import { createAuthApp } from "../src/author/app.js";

const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make(root: string) {
  return createAuthApp({
    registry,
    token: "t",
    selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: OPENUI,
    specPath: join(root, "boyscout-spec.json"),
    openuiPath: join(root, "boyscout.openui"),
    projectRoot: root,
  });
}
const auth = { Authorization: "Bearer t", "content-type": "application/json" };

describe("author daemon: commit gate", () => {
  it("rejects commit while a feature is unapproved (422)", async () => {
    const root = mkdtempSync(join(tmpdir(), "bs-"));
    const { app } = make(root);
    const res = await app.request("/api/commit", { method: "POST", headers: auth });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.violations.some((v: string) => v.includes("card") && v.includes("not approved"))).toBe(true);
  });

  it("writes canonical spec.json + .openui (byte-identical to the determinism path) once approved", async () => {
    const root = mkdtempSync(join(tmpdir(), "bs-"));
    const { app } = make(root);
    await app.request("/api/approve", { method: "POST", headers: auth, body: JSON.stringify({ featureId: "card", approved: true }) });
    const res = await app.request("/api/commit", { method: "POST", headers: auth });
    expect(res.status).toBe(200);

    const spec = parseOpenui(OPENUI, registry);
    expect(hash(readFileSync(join(root, "boyscout-spec.json")))).toBe(hash(writeBytes(canonicalJson(spec))));
    // the .openui round-trips: re-parsing the written file yields the same spec
    const writtenOpenui = readFileSync(join(root, "boyscout.openui"), "utf8");
    expect(parseOpenui(writtenOpenui, registry)).toEqual(spec);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/cli/test/author-commit.test.ts`
Expected: FAIL — the temp `registerCommit` registers no `/api/commit`, so the request 404s.

- [ ] **Step 3: Write the real commit route**

`apps/cli/src/author/commit.ts`:
```ts
import { writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Hono } from "hono";
import { canonicalJson, writeBytes } from "@boyscout/determinism";
import { type DialectRegistry, serializeOpenui } from "@boyscout/dialect";
import type { SpecificationT } from "@boyscout/schemas";
import type { AuthAppOptions } from "./app.js";

function shieldWrite(target: string, root: string, bytes: Uint8Array): void {
  const abs = resolve(target);
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error(`refusing to write outside project root: ${target}`);
  }
  writeFileSync(abs, bytes);
}

export function registerCommit(
  app: Hono,
  opts: AuthAppOptions,
  getSpec: () => SpecificationT | null,
  getApprovals: () => Record<string, boolean>,
  registry: DialectRegistry,
): void {
  app.post("/api/commit", (c) => {
    const spec = getSpec();
    const approvals = getApprovals();
    const violations: string[] = [];
    if (!spec) violations.push("no valid spec: fix parse/validation errors first");
    else for (const f of spec.features) if (!approvals[f.id]) violations.push(`feature ${f.id} not approved`);
    if (violations.length > 0) return c.json({ ok: false, violations }, 422);

    const s = spec as SpecificationT;
    shieldWrite(opts.specPath, opts.projectRoot, writeBytes(canonicalJson(s)));
    shieldWrite(opts.openuiPath, opts.projectRoot, writeBytes(serializeOpenui(s, registry)));
    return c.json({ ok: true, written: [opts.specPath, opts.openuiPath] });
  });
}
```

In `apps/cli/src/author/app.ts`: delete the temporary `registerCommit` function at the bottom, and add near the top imports:
```ts
import { registerCommit } from "./commit.js";
```
(The existing `registerCommit(app, opts, () => spec, () => approvals, registry)` call is unchanged.)

- [ ] **Step 4: Run the commit test to verify it passes**

Run: `npx vitest run apps/cli/test/author-commit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the `.openui` cross-OS golden test**

`apps/cli/test/openui-golden.test.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui, serializeOpenui } from "@boyscout/dialect";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const SOURCE = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
    }
  }`;

describe("SP4b: .openui write path is byte-stable cross-OS", () => {
  it("writeBytes(serializeOpenui(spec)) matches the committed golden", () => {
    const spec = parseOpenui(SOURCE, registry);
    const bytes = writeBytes(serializeOpenui(spec, registry));
    const golden = here("./goldens/openui/canonical.openui");
    if (UPDATE) {
      mkdirSync(dirname(golden), { recursive: true });
      writeFileSync(golden, bytes);
      return;
    }
    expect(existsSync(golden), "missing .openui golden").toBe(true);
    expect(hash(bytes)).toBe(hash(readFileSync(golden)));
  });
});
```

- [ ] **Step 6: Generate the golden and verify it locks**

Run: `UPDATE_GOLDENS=1 npx vitest run apps/cli/test/openui-golden.test.ts`
Then: `npx vitest run apps/cli/test/openui-golden.test.ts`
Expected: first run writes `apps/cli/test/goldens/openui/canonical.openui`; second run PASS. Open the golden and confirm it is the canonical form (2-space indent, LF, trailing newline).

- [ ] **Step 7: Add the `author` command**

`apps/cli/src/author/command.ts`:
```ts
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { registry } from "@boyscout/bridge-astryx-react";
import { createAuthApp } from "./app.js";

function flag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** `boyscout author --openui <f> [--spec <f>] [--host 127.0.0.1] [--port 4517] [--ui-dist <dir>]` */
export function authorCommand(argv: string[]): number {
  const openuiPath = resolve(flag(argv, "--openui", "./boyscout.openui"));
  const specPath = resolve(flag(argv, "--spec", "./boyscout-spec.json"));
  const host = flag(argv, "--host", "127.0.0.1");
  const port = Number(flag(argv, "--port", "4517"));
  const uiDist = resolve(
    flag(argv, "--ui-dist", fileURLToPath(new URL("../../../boyscout-ui/dist", import.meta.url))),
  );
  const token = randomBytes(24).toString("hex");
  const selfOrigin = `http://${host}:${port}`;
  const initialOpenui = existsSync(openuiPath) ? readFileSync(openuiPath, "utf8") : "";

  const { app } = createAuthApp({
    registry,
    token,
    selfOrigin,
    initialOpenui,
    specPath,
    openuiPath,
    projectRoot: process.cwd(),
  });

  // Static SPA, path-shielded to uiDist; unknown paths fall back to index.html (SPA routing).
  app.get("/*", (c) => {
    const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
    const abs = resolve(uiDist, rel);
    const indexHtml = resolve(uiDist, "index.html");
    const inside = abs === uiDist || abs.startsWith(uiDist + sep);
    const file = inside && existsSync(abs) ? abs : indexHtml;
    if (!existsSync(file)) return c.text("boyscout-ui not built (run: pnpm --filter boyscout-ui build)", 500);
    const body = readFileSync(file);
    return new Response(body, { headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" } });
  });

  serve({ fetch: app.fetch, hostname: host, port });
  process.stdout.write(`boyscout author: open ${selfOrigin}/?t=${token}\n`);
  return 0;
}
```

In `apps/cli/src/main.ts`, route the subcommand. Change the command dispatch: after reading `const command = argv[0];`, insert before the `generate` handling:
```ts
  if (command === "author") return authorCommand(argv.slice(1));
```
and add the import at the top:
```ts
import { authorCommand } from "./author/command.js";
```
Update the unknown-command usage string to `usage: boyscout generate | boyscout author`.

- [ ] **Step 8: Full suite + typecheck**

Run: `npx vitest run && pnpm -r typecheck`
Expected: PASS all; no type errors. (`authorCommand` is integration-covered by Task 7; there is no unit test that binds a socket.)

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/author/commit.ts apps/cli/src/author/app.ts apps/cli/src/author/command.ts \
        apps/cli/src/main.ts apps/cli/test/author-commit.test.ts apps/cli/test/openui-golden.test.ts \
        apps/cli/test/goldens/openui/canonical.openui
git commit -m "feat(cli): author commit gate + writeBytes persistence + boyscout author command; .openui cross-OS golden"
```

---

### Task 5: SPA scaffold + Astryx component map + parity test

**Files:**
- Create: `apps/boyscout-ui/package.json`
- Create: `apps/boyscout-ui/tsconfig.json`
- Create: `apps/boyscout-ui/vite.config.ts`
- Create: `apps/boyscout-ui/index.html`
- Create: `apps/boyscout-ui/src/astryx-nodes.ts` (plain node-type list — no react/astryx import)
- Create: `apps/boyscout-ui/src/astryx-map.tsx` (the component map)
- Test: `apps/boyscout-ui/test/astryx-map.test.ts` (parity: list vs bridge catalog)

**Interfaces:**
- Consumes: `ComponentMap` from `@boyscout/renderer`; `COMPONENTS` from `@boyscout/bridge-astryx-react`; Astryx components from `@astryxdesign/core`.
- Produces:
  - `astryx-nodes.ts`: `export const ASTRYX_COMPONENT_NODES = ["VStack","HStack","Card","Grid","Heading","Text","Button"] as const;`
  - `astryx-map.tsx`: `export const astryxMap: ComponentMap` covering every entry in `ASTRYX_COMPONENT_NODES` plus structural placeholders for logic-bearing node types.

- [ ] **Step 1: Create the SPA manifest and config**

`apps/boyscout-ui/package.json`:
```json
{
  "name": "boyscout-ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@astryxdesign/core": "0.1.4",
    "@boyscout/renderer": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "@stylexjs/stylex": "0.18.3",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@boyscout/bridge-astryx-react": "workspace:*",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.7",
    "typescript": "5.9.3",
    "vite": "8.1.4"
  }
}
```

`apps/boyscout-ui/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"],
    "jsx": "react-jsx"
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`apps/boyscout-ui/vite.config.ts` (esbuild automatic JSX — no `@vitejs/plugin-react` needed for a build):
```ts
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  build: { outDir: "dist", emptyOutDir: true },
});
```

`apps/boyscout-ui/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BoyScout Authoring</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the failing parity test**

`apps/boyscout-ui/test/astryx-map.test.ts`:
```ts
import { COMPONENTS } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { ASTRYX_COMPONENT_NODES } from "../src/astryx-nodes.js";

describe("astryx preview map parity", () => {
  it("covers exactly the bridge's component-capability node types", () => {
    expect([...ASTRYX_COMPONENT_NODES].sort()).toEqual([...COMPONENTS].sort());
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run apps/boyscout-ui/test/astryx-map.test.ts`
Expected: FAIL — `Cannot find module '../src/astryx-nodes.js'`.

- [ ] **Step 4: Write the node list and the component map**

`apps/boyscout-ui/src/astryx-nodes.ts` (pure data — imported by both the map and the test; NO react/astryx import so the test stays node-clean):
```ts
/** The `component` capability node types the preview map renders. Kept in sync with the bridge catalog (parity test). */
export const ASTRYX_COMPONENT_NODES = [
  "VStack",
  "HStack",
  "Card",
  "Grid",
  "Heading",
  "Text",
  "Button",
] as const;
```

`apps/boyscout-ui/src/astryx-map.tsx`:
```tsx
import type { ComponentMap, NodeComponent } from "@boyscout/renderer";
import { Button, Card, Grid, Stack, Text } from "@astryxdesign/core";

const num = (v: unknown, d: number): number => (typeof v === "number" ? v : d);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const VStack: NodeComponent = ({ node, children }) => (
  <Stack direction="vertical" gap={num(node.props?.gap, 0)}>{children}</Stack>
);
const HStack: NodeComponent = ({ node, children }) => (
  <Stack direction="horizontal" gap={num(node.props?.gap, 0)}>{children}</Stack>
);
const CardNode: NodeComponent = ({ children }) => <Card>{children}</Card>;
const GridNode: NodeComponent = ({ node, children }) => (
  <Grid columns={num(node.props?.columns, 1)}>{children}</Grid>
);
// Astryx has no dedicated Heading; render Text at a heading-scaled size derived from `level`.
const Heading: NodeComponent = ({ node }) => (
  <Text size={num(node.props?.level, 1) <= 2 ? "xlarge" : "large"} weight="bold">{str(node.props?.text)}</Text>
);
const TextNode: NodeComponent = ({ node }) => <Text>{str(node.props?.text)}</Text>;
const ButtonNode: NodeComponent = ({ node }) => (
  <Button variant={str(node.props?.variant) === "primary" ? "primary" : "secondary"}>{str(node.props?.text)}</Button>
);

/** Non-visual logic-bearing nodes carry no pixels — show a labeled structural placeholder. */
const placeholder = (label: string): NodeComponent => ({ node, children }) => (
  <div style={{ border: "1px dashed #999", padding: 4, margin: 2, font: "12px monospace" }}>
    {label}: {str(node.props?.name)}
    {children}
  </div>
);

export const astryxMap: ComponentMap = {
  VStack,
  HStack,
  Card: CardNode,
  Grid: GridNode,
  Heading,
  Text: TextNode,
  Button: ButtonNode,
  Service: placeholder("service"),
  Method: placeholder("method"),
  Store: placeholder("store"),
  Action: placeholder("action"),
  Http: placeholder("http"),
  Endpoint: placeholder("endpoint"),
};
```
Note: the `Text` props (`size`, `weight`) and `Button`/`Stack`/`Grid` prop names above follow `@astryxdesign/core` 0.1.4. If a prop name/type mismatches during `pnpm --filter boyscout-ui typecheck`, adjust to the component's actual props (check `node_modules/@astryxdesign/core/dist/<Component>/*.d.ts`) — the map is the one place allowed to know Astryx's real API. Do not change `astryx-nodes.ts` to match; the parity test binds it to the bridge catalog.

- [ ] **Step 5: Run the parity test to verify it passes**

Run: `npx vitest run apps/boyscout-ui/test/astryx-map.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Install deps and typecheck**

Run: `pnpm install` (links the new workspace) then `pnpm --filter boyscout-ui typecheck`
Expected: no errors (adjust Astryx prop names per Step 4 note if the compiler flags them).

- [ ] **Step 7: Commit**

```bash
git add apps/boyscout-ui/package.json apps/boyscout-ui/tsconfig.json apps/boyscout-ui/vite.config.ts \
        apps/boyscout-ui/index.html apps/boyscout-ui/src/astryx-nodes.ts apps/boyscout-ui/src/astryx-map.tsx \
        apps/boyscout-ui/test/astryx-map.test.ts pnpm-lock.yaml
git commit -m "feat(boyscout-ui): Vite SPA scaffold + Astryx preview component map + catalog-parity test"
```

---

### Task 6: SPA App — editor, live preview, approval list, commit

**Files:**
- Create: `apps/boyscout-ui/src/api.ts` (typed fetch client with Bearer token)
- Create: `apps/boyscout-ui/src/App.tsx`
- Create: `apps/boyscout-ui/src/main.tsx`
- Test: `apps/boyscout-ui/test/api.test.ts` (token/URL wiring, headless via a stubbed fetch)

**Interfaces:**
- Consumes: `Renderer` + `astryxMap`; the daemon API (`/api/state`, `/api/parse`, `/api/approve`, `/api/commit`).
- Produces:
  - `api.ts`: `function readToken(search: string): string` and `function makeClient(token: string, fetchImpl?: typeof fetch)` returning `{ state, parse, approve, commit }` — all sending `Authorization: Bearer <token>`.
  - `App.tsx`: `export function App(props: { client: ReturnType<typeof makeClient> }): ReactElement`.
  - `main.tsx`: reads the token from `window.location.search`, mounts `<App>` into `#root`, imports `@astryxdesign/core/astryx.css`.

- [ ] **Step 1: Write the failing api test**

`apps/boyscout-ui/test/api.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeClient, readToken } from "../src/api.js";

describe("api client", () => {
  it("reads the token from the URL query", () => {
    expect(readToken("?t=abc123")).toBe("abc123");
    expect(readToken("")).toBe("");
  });

  it("sends the Bearer token on every call", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = makeClient("tok", fakeFetch);
    await client.parse("some text");
    expect(calls[0]?.url).toContain("/api/parse");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run apps/boyscout-ui/test/api.test.ts`
Expected: FAIL — `Cannot find module '../src/api.js'`.

- [ ] **Step 3: Write the api client**

`apps/boyscout-ui/src/api.ts`:
```ts
import type { SpecificationT } from "@boyscout/schemas";

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
}

export function readToken(search: string): string {
  return new URLSearchParams(search).get("t") ?? "";
}

export function makeClient(token: string, fetchImpl: typeof fetch = fetch) {
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetchImpl(path, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  };
  return {
    state: async (): Promise<AuthState> => (await fetchImpl("/api/state", { headers })).json(),
    parse: (text: string) => post("/api/parse", { text }) as Promise<{ ok: boolean; ast: SpecificationT | null; errors: AuthState["errors"] }>,
    approve: (featureId: string, approved: boolean) => post("/api/approve", { featureId, approved }) as Promise<{ approvals: Record<string, boolean> }>,
    commit: () => post("/api/commit", {}) as Promise<{ ok: boolean; written?: string[]; violations?: string[] }>,
  };
}
```

- [ ] **Step 4: Run the api test to verify it passes**

Run: `npx vitest run apps/boyscout-ui/test/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the App and entrypoint**

`apps/boyscout-ui/src/App.tsx`:
```tsx
import type { FeatureT } from "@boyscout/schemas";
import { Renderer } from "@boyscout/renderer";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { makeClient } from "./api.js";
import { astryxMap } from "./astryx-map.js";

type Client = ReturnType<typeof makeClient>;

export function App({ client }: { client: Client }): ReactElement {
  const [text, setText] = useState("");
  const [features, setFeatures] = useState<FeatureT[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void client.state().then((s) => {
      setText(s.openui);
      setFeatures(s.ast?.features ?? []);
      setApprovals(s.approvals);
      setErrors(s.errors);
    });
  }, [client]);

  const onEdit = (next: string): void => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void client.parse(next).then((r) => {
        setErrors(r.errors);
        if (r.ok && r.ast) setFeatures(r.ast.features);
      });
      void client.state().then((s) => setApprovals(s.approvals));
    }, 250);
  };

  const toggle = (id: string, approved: boolean): void => {
    void client.approve(id, approved).then((r) => setApprovals(r.approvals));
  };

  const commit = (): void => {
    void client.commit().then((r) => {
      setMessage(r.ok ? `Wrote: ${r.written?.join(", ")}` : `Cannot write: ${r.violations?.join("; ")}`);
    });
  };

  const allApproved = features.length > 0 && features.every((f) => approvals[f.id]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100vh", padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <textarea
          data-testid="editor"
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
        />
        {errors.length > 0 && (
          <ul data-testid="errors" style={{ color: "crimson", fontFamily: "monospace" }}>
            {errors.map((e, i) => (
              <li key={i}>line {e.line}: {e.message}</li>
            ))}
          </ul>
        )}
        <div>
          {features.map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                data-testid={`approve-${f.id}`}
                checked={!!approvals[f.id]}
                onChange={(e) => toggle(f.id, e.target.checked)}
              />
              {f.capability} {f.id}
            </label>
          ))}
          <button type="button" data-testid="commit" disabled={!allApproved} onClick={commit}>
            Write spec
          </button>
          <span data-testid="message">{message}</span>
        </div>
      </div>
      <div data-testid="preview" style={{ overflow: "auto", border: "1px solid #ddd" }}>
        {features.map((f) => (
          <div key={f.id}>
            <Renderer ast={f.tree} components={astryxMap} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

`apps/boyscout-ui/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@astryxdesign/core/astryx.css";
import { App } from "./App.js";
import { makeClient, readToken } from "./api.js";

const client = makeClient(readToken(window.location.search));
const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App client={client} /></StrictMode>);
```

- [ ] **Step 6: Typecheck and build**

Run: `pnpm --filter boyscout-ui typecheck && pnpm --filter boyscout-ui build`
Expected: typecheck clean; `vite build` writes `apps/boyscout-ui/dist/index.html` + assets (confirm `apps/boyscout-ui/dist/` exists).

- [ ] **Step 7: Commit**

```bash
git add apps/boyscout-ui/src/api.ts apps/boyscout-ui/src/App.tsx apps/boyscout-ui/src/main.tsx \
        apps/boyscout-ui/test/api.test.ts
git commit -m "feat(boyscout-ui): editor + live Astryx preview + approval gate + commit wiring"
```

---

### Task 7: Playwright E2E — author → preview → approve → commit → generate

**Files:**
- Modify: `apps/boyscout-ui/package.json` (add `@playwright/test`, an `e2e` script)
- Create: `apps/boyscout-ui/playwright.config.ts`
- Create: `apps/boyscout-ui/e2e/fixtures/seed.openui`
- Create: `apps/boyscout-ui/e2e/authoring.spec.ts`

**Interfaces:**
- Consumes: the built SPA (`dist/`), `boyscout author` (Task 4), `boyscout generate` (existing), the escaping guard (Task 2).
- Produces: an end-to-end proof that the browser loop yields a `spec.json` which `boyscout generate` drives to scaffolds, plus a negative check that an unsafe logic-bearing identifier is rejected at the gate.

- [ ] **Step 1: Add Playwright**

```bash
pnpm --filter boyscout-ui add -D @playwright/test
npx playwright install chromium
```
(If either cannot reach the network, STOP — BLOCKED.) Add to `apps/boyscout-ui/package.json` scripts: `"e2e": "playwright test"`.

- [ ] **Step 2: Write the Playwright config**

`apps/boyscout-ui/playwright.config.ts` — builds the SPA and starts the daemon before tests. The daemon prints the token URL; the test bootstraps the token from a fixed value by launching the daemon itself (see spec), so no webServer token capture is needed:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:4599" },
});
```

- [ ] **Step 3: Write the seed fixture**

`apps/boyscout-ui/e2e/fixtures/seed.openui`:
```
spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
```

- [ ] **Step 4: Write the E2E spec**

`apps/boyscout-ui/e2e/authoring.spec.ts` — spawns the daemon with a known token+port against a temp project, drives the UI, then asserts the CLI generate output. Uses Node child processes from within the test:
```ts
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const uiDist = resolve(here, "../dist");
const cliBin = resolve(repoRoot, "apps/cli/src/bin.ts");
const PORT = 4599;
const TOKEN = "e2e-fixed-token";

// The daemon reads a fixed token via env for deterministic E2E (see command.ts note below).
let daemon: ChildProcess;
let projectDir: string;

test.beforeAll(async () => {
  expect(existsSync(uiDist), "run `pnpm --filter boyscout-ui build` first").toBeTruthy();
  projectDir = mkdtempSync(join(tmpdir(), "bs-e2e-"));
  copyFileSync(join(here, "fixtures/seed.openui"), join(projectDir, "boyscout.openui"));
  copyFileSync(resolve(repoRoot, "apps/cli/test/fixtures/dialect-config.yaml"), join(projectDir, "boyscout.config.yaml"));

  daemon = spawn(
    "node",
    ["--import", "tsx", cliBin, "author", "--openui", "./boyscout.openui", "--spec", "./boyscout-spec.json", "--port", String(PORT), "--ui-dist", uiDist],
    { cwd: projectDir, env: { ...process.env, BOYSCOUT_AUTH_TOKEN: TOKEN }, stdio: "inherit" },
  );
  // wait for the port to answer
  await expect.poll(async () => {
    try { return (await fetch(`http://127.0.0.1:${PORT}/`)).status; } catch { return 0; }
  }, { timeout: 20_000 }).toBe(200);
});

test.afterAll(() => { daemon?.kill(); });

test("author -> preview -> approve -> commit -> generate", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/?t=${TOKEN}`);
  await expect(page.getByTestId("preview")).toContainText("Profile");
  await page.getByTestId("approve-user-card").check();
  await page.getByTestId("commit").click();
  await expect(page.getByTestId("message")).toContainText("Wrote:");

  // spec.json now on disk
  const specPath = join(projectDir, "boyscout-spec.json");
  expect(existsSync(specPath)).toBeTruthy();

  // the existing CLI drives it to scaffolds
  const gen = spawnSync("node", ["--import", "tsx", cliBin, "generate", "--spec", specPath, "--config", join(projectDir, "boyscout.config.yaml")], { cwd: projectDir, encoding: "utf8" });
  expect(gen.status).toBe(0);
  expect(existsSync(join(projectDir, ".running/UserCard.tsx"))).toBeTruthy();
});

test("unsafe logic-bearing identifier is rejected at the gate", async () => {
  // Author a service with an illegal name directly through the daemon API; commit must not write.
  const bad = `spec version=1 bridge=astryx-react platform=react\n\nservice svc =\n  Service("Bad Name") {\n    Method("getX", "", "void")\n  }`;
  const headers = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json", Origin: `http://127.0.0.1:${PORT}` };
  const res = await fetch(`http://127.0.0.1:${PORT}/api/parse`, { method: "POST", headers, body: JSON.stringify({ text: bad }) });
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(JSON.stringify(body.errors)).toContain("unsafe identifier");
});
```

- [ ] **Step 5: Wire the fixed-token env hook into the command**

The E2E needs a deterministic token. In `apps/cli/src/author/command.ts`, change the token line to honor an env override (production still uses CSPRNG):
```ts
  const token = process.env.BOYSCOUT_AUTH_TOKEN ?? randomBytes(24).toString("hex");
```
Add a one-line comment: `// BOYSCOUT_AUTH_TOKEN overrides the CSPRNG token for deterministic E2E only; unset in normal use.`

- [ ] **Step 6: Build the SPA, then run the E2E**

Run:
```bash
pnpm --filter boyscout-ui build
pnpm --filter boyscout-ui e2e
```
Expected: both E2E tests PASS. (`tsx` must be available to run the raw-TS CLI; if `node --import tsx` fails because `tsx` is absent, `pnpm --filter @boyscout/cli add -D tsx` and retry — note it in the report.)

- [ ] **Step 7: Full suite + typecheck**

Run: `npx vitest run && pnpm -r typecheck`
Expected: PASS all; no type errors.

- [ ] **Step 8: Commit**

```bash
git add apps/boyscout-ui/package.json apps/boyscout-ui/playwright.config.ts \
        apps/boyscout-ui/e2e/fixtures/seed.openui apps/boyscout-ui/e2e/authoring.spec.ts \
        apps/cli/src/author/command.ts pnpm-lock.yaml
git commit -m "test(boyscout-ui): Playwright E2E — author->preview->approve->commit->generate + unsafe-identifier rejection"
```

---

## Notes for the executor

- **Task order & independence:** Tasks 1 and 2 are independent of each other and of the daemon. Task 4 depends on Task 3; Task 6 depends on Tasks 1 and 5; Task 7 depends on Tasks 2, 4, and 6. Execute in numeric order.
- **Biome format:** the repo gates on `pnpm format:check`. After the final task, run `pnpm format` (the controller may need to run it outside the subagent sandbox, as in SP4a) and commit any whitespace-only changes so `format:check` is green.
- **No golden updates without cause:** `UPDATE_GOLDENS=1` is used ONCE intentionally in Task 4 Step 6 to mint the new `.openui` golden. Any *drift* in a pre-existing golden (Task 2 Step 9) is a real regression — investigate, do not overwrite.
- **Cross-OS:** the determinism goldens (`.tsx`, `.openui`) run under the existing 3-OS CI matrix. The Playwright E2E runs on the default CI OS only (browser E2E is not part of the byte-identity guarantee, §1.3).
