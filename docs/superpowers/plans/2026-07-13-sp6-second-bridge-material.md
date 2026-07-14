# SP6 — Second Bridge: Material/Angular Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `@boyscout/bridge-material` (Angular + Material Design) that generates governed Angular headlessly and passes a shared, bridge-parametrized contract suite byte-for-byte identical to the one the Astryx bridge passes — proving the Runtime is framework-agnostic (D1) without modifying the Runtime.

**Architecture:** A new bridge package (registry, providers, dumb Eta templates, guardrails, Angular http seam) + a new test-only `@boyscout/bridge-contract-kit` that both bridges run + a 3-line bridge lookup in the CLI. The Runtime already consumes any `Bridge` by interface and is not touched. Generation is pure text templating (no Angular runtime import in providers); the only reference to real `@angular/material` is the registry's dev-time self-verification.

**Tech Stack:** TypeScript (strict, ESM/NodeNext), Eta templates, Angular 18+ / Angular Material (devDependency, types only), Vitest, Biome, the existing `@boyscout/*` primitives (`schemas`, `determinism`, `codegen`, `guardrails`, `planner`, `runtime`).

## Global Constraints

- **Strict TS** (`tsconfig.base.json`): `verbatimModuleSyntax`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `isolatedModules` all ON → use `import type` (or inline `type` modifiers), `.js` specifiers on relative imports, conditional spread for optional props (`...(x !== undefined ? { x } : {})`).
- **Bridge identity:** `id: "material"`, `platform: "angular"`, `postRules: [materialOnly, biomeLint]` (≥2 post-rules).
- **Capabilities:** `component`, `form`, `route` are **declarative** (single disposable asset); `http` is **logic-bearing** (disposable scaffold + durable stub + `SeamContractT`).
- **Providers never import Angular at runtime** — they `render()` Eta templates to strings, exactly as the Astryx providers render `.tsx` text without importing React.
- **Determinism:** build output via `render()` (Eta) with attributes sorted by `byteCompare`; byte-stable and cross-OS (invariant #7). Downstream `format()` normalizes surrounding TS; HTML inside a template literal is preserved verbatim, so `renderNode` output must be deterministic.
- **Do NOT modify `packages/runtime/`** — it is already agnostic.
- **`@angular/material` is a `devDependency`** (with peers `@angular/core`, `@angular/common`, `@angular/forms`, `rxjs`). Generation must not import it.
- **No per-package `test` script.** Run a test file with `npx vitest run <path>` from the repo root. Typecheck a package with `pnpm --filter <name> typecheck`.
- **Biome is CI-authoritative and OOMs on the full repo locally.** Before finishing a task, run scoped: `npx biome lint packages apps` and `pnpm format` (writes) / `pnpm format:check`.
- **New packages join the workspace automatically:** `packages/bridges/*` (bridge-material) and `packages/*` (bridge-contract-kit) are already globbed by `pnpm-workspace.yaml`. Run `pnpm install` once after creating each `package.json`.
- **Commit frequently**, one commit per task minimum.

---

### Task 1: `bridge-material` package skeleton + Angular seam tsc smoke test (de-risk)

Retire the #1 risk first: confirm a **real Angular** http service scaffold + a human transforms stub typecheck together under bare `ts.createProgram` (matching → 0 diagnostics, drift → >0) with Angular-flavored compiler options. This validates the seam mechanism before any provider is built.

**Files:**
- Create: `packages/bridges/bridge-material/package.json`
- Create: `packages/bridges/bridge-material/tsconfig.json`
- Create: `packages/bridges/bridge-material/src/naming.ts`
- Test: `packages/bridges/bridge-material/test/naming.test.ts`
- Test: `packages/bridges/bridge-material/test/seam-smoke.test.ts`

**Interfaces:**
- Produces: `kebab(s: string): string`, `camel(s: string): string`, `pascal(s: string): string` from `src/naming.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@boyscout/bridge-material",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@boyscout/codegen": "workspace:*",
    "@boyscout/determinism": "workspace:*",
    "@boyscout/guardrails": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "typescript": "5.9.3"
  },
  "devDependencies": {
    "@angular/common": "18.2.14",
    "@angular/core": "18.2.14",
    "@angular/forms": "18.2.14",
    "@angular/material": "18.2.14",
    "@angular/router": "18.2.14",
    "rxjs": "7.8.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: `pnpm install`**

Run: `pnpm install`
Expected: installs `@angular/*` + `rxjs`; workspace links `@boyscout/*`. No errors.

- [ ] **Step 4: Write the failing naming test**

`packages/bridges/bridge-material/test/naming.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { camel, kebab, pascal } from "../src/naming.js";

describe("naming", () => {
  it("kebab splits camelCase and non-alphanumerics", () => {
    expect(kebab("UsersApi")).toBe("users-api");
    expect(kebab("user service")).toBe("user-service");
  });
  it("camel lower-cases the first word", () => {
    expect(camel("UsersApi")).toBe("usersApi");
  });
  it("pascal upper-cases the first word", () => {
    expect(pascal("users-api")).toBe("UsersApi");
    expect(pascal("usersApi")).toBe("UsersApi");
  });
});
```

- [ ] **Step 5: Run it — expect FAIL** (`Cannot find module '../src/naming.js'`)

Run: `npx vitest run packages/bridges/bridge-material/test/naming.test.ts`

- [ ] **Step 6: Implement `src/naming.ts`**

```ts
/** "UsersApi" -> "users-api". Splits camelCase and non-alphanumerics. */
export function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
}

/** "UsersApi" -> "usersApi". */
export function camel(s: string): string {
  const parts = s
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/);
  return parts
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() : w.charAt(0).toUpperCase()) + w.slice(1))
    .join("");
}

/** "users-api" -> "UsersApi". */
export function pascal(s: string): string {
  const c = camel(s);
  return c.charAt(0).toUpperCase() + c.slice(1);
}
```

- [ ] **Step 7: Run naming test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/naming.test.ts`
Expected: 3 passing.

- [ ] **Step 8: Write the seam smoke test** (the spike — proves Angular typechecks under bare tsc)

`packages/bridges/bridge-material/test/seam-smoke.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("../", import.meta.url));
const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
});

// Angular-flavored options: decorators on, declaration-only compile against real @angular types.
const ANGULAR_OPTS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};

function diagnose(
  scaffold: { path: string; content: string },
  stub: { path: string; content: string },
): readonly ts.Diagnostic[] {
  const dir = mkdtempSync(join(pkgRoot, ".smoke-tmp-"));
  tmps.push(dir);
  const scaffoldPath = join(dir, ".running", scaffold.path);
  const stubPath = join(dir, "src", stub.path);
  mkdirSync(dirname(scaffoldPath), { recursive: true });
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(scaffoldPath, scaffold.content);
  writeFileSync(stubPath, stub.content);
  const program = ts.createProgram([scaffoldPath, stubPath], ANGULAR_OPTS);
  return ts.getPreEmitDiagnostics(program);
}

const scaffold = {
  path: "http/UsersApi.service.ts",
  content: `import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map, type Observable } from "rxjs";
import { usersApiTransforms } from "../../src/http/users-api.transforms.js";

export interface UsersApiTransforms {
  getUsers(raw: unknown): string[];
}

const transforms: UsersApiTransforms = usersApiTransforms;

@Injectable({ providedIn: "root" })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getUsers(): Observable<string[]> {
    return this.http.request<unknown>("GET", "/users").pipe(map((raw) => transforms.getUsers(raw)));
  }
}
`,
};

describe("Angular seam typechecks under bare tsc (spike)", () => {
  it("matching stub compiles with zero diagnostics", () => {
    const stub = {
      path: "http/users-api.transforms.ts",
      content: `export const usersApiTransforms = {
  getUsers(raw: unknown): string[] {
    throw new Error("not implemented");
  },
};
`,
    };
    expect(diagnose(scaffold, stub)).toHaveLength(0);
  });

  it("a drifted return type is a compile error", () => {
    const drift = {
      path: "http/users-api.transforms.ts",
      content: `export const usersApiTransforms = {
  getUsers(raw: unknown): number {
    throw new Error("not implemented");
  },
};
`,
    };
    expect(diagnose(scaffold, drift).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 9: Run the smoke test**

Run: `npx vitest run packages/bridges/bridge-material/test/seam-smoke.test.ts`
Expected: 2 passing.

> **Contingency (only if Step 9 fails):** if Angular `.d.ts` + decorators cannot be resolved by bare `tsc`, adopt the spec's documented fallback — emit the `<Name>Transforms` interface into a **separate plain-TS contract file** (`.running/http/<name>.contract.ts`) that both the `@Injectable` service and the stub import, and have the seam drift-check compile the plain-TS contract + stub only (framework-free), excluding the decorated service. Record which path was taken in the task report; Task 6 must match it.

- [ ] **Step 10: Typecheck + commit**

Run: `pnpm --filter @boyscout/bridge-material typecheck` → clean.
Run: `npx biome lint packages/bridges/bridge-material` → clean.

```bash
git add packages/bridges/bridge-material pnpm-lock.yaml
git commit -m "feat(sp6): bridge-material skeleton + Angular seam tsc smoke test"
```

---

### Task 2: Registry catalog + self-verification

The Material component catalog (AST node type → real `@angular/material` symbol/selector) and positional DSL params, with a test that verifies every catalog symbol is a real export of its `@angular/material` subpath — via `tsc` resolution against the published `.d.ts`, never by executing Angular.

**Files:**
- Create: `packages/bridges/bridge-material/src/catalog.ts`
- Create: `packages/bridges/bridge-material/src/params.ts`
- Create: `packages/bridges/bridge-material/src/verify-catalog.ts`
- Test: `packages/bridges/bridge-material/test/catalog.test.ts`

**Interfaces:**
- Produces: `CATALOG: Record<string, CatalogEntry>` where `CatalogEntry = { selector: string; symbol: string; importPath: string }`; `COMPONENTS: readonly string[]` (= `Object.keys(CATALOG)`); `TEXT_CHILD: ReadonlySet<string>`; `paramsFor(nodeType: string): readonly string[]`; `verifyMaterialCatalog(): void` (throws if any symbol is not a real export).

- [ ] **Step 1: Write the failing catalog test**

`packages/bridges/bridge-material/test/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATALOG, COMPONENTS, paramsFor } from "../src/catalog.js";
import { verifyMaterialCatalog } from "../src/verify-catalog.js";

describe("material catalog", () => {
  it("lists Material element-selector components with real subpaths", () => {
    expect(COMPONENTS).toContain("Card");
    expect(CATALOG.Card?.selector).toBe("mat-card");
    expect(CATALOG.Card?.symbol).toBe("MatCard");
    expect(CATALOG.Card?.importPath).toBe("@angular/material/card");
  });

  it("paramsFor returns positional names, [] for unknown", () => {
    expect(paramsFor("Card")).toEqual([]);
    expect(paramsFor("Nope")).toEqual([]);
  });

  it("every catalog symbol is a real @angular/material export (self-verifiable registry)", () => {
    expect(() => verifyMaterialCatalog()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (modules not found)

Run: `npx vitest run packages/bridges/bridge-material/test/catalog.test.ts`

- [ ] **Step 3: Implement `src/catalog.ts`**

```ts
export interface CatalogEntry {
  selector: string;
  symbol: string;
  importPath: string;
}

/** Material element-selector components (node type -> real @angular/material symbol). Extend by adding rows. */
export const CATALOG: Record<string, CatalogEntry> = {
  Card: { selector: "mat-card", symbol: "MatCard", importPath: "@angular/material/card" },
  CardTitle: {
    selector: "mat-card-title",
    symbol: "MatCardTitle",
    importPath: "@angular/material/card",
  },
  CardContent: {
    selector: "mat-card-content",
    symbol: "MatCardContent",
    importPath: "@angular/material/card",
  },
  Toolbar: { selector: "mat-toolbar", symbol: "MatToolbar", importPath: "@angular/material/toolbar" },
  List: { selector: "mat-list", symbol: "MatList", importPath: "@angular/material/list" },
  ListItem: {
    selector: "mat-list-item",
    symbol: "MatListItem",
    importPath: "@angular/material/list",
  },
};

export const COMPONENTS: readonly string[] = Object.keys(CATALOG);

/** Nodes whose `text` prop renders as the element's text child rather than an attribute. */
export const TEXT_CHILD: ReadonlySet<string> = new Set(["CardTitle", "Toolbar", "ListItem"]);

const PARAMS: Record<string, readonly string[]> = {
  // component (declarative; container elements take no positional params by default)
  Card: [],
  CardTitle: ["text"],
  CardContent: [],
  Toolbar: ["text"],
  List: [],
  ListItem: ["text"],
  // form
  Form: ["name"],
  Field: ["name", "label", "type"],
  // route
  Routes: [],
  Route: ["path", "component"],
  // http
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export function paramsFor(nodeType: string): readonly string[] {
  return PARAMS[nodeType] ?? [];
}
```

- [ ] **Step 4: Implement `src/verify-catalog.ts`**

```ts
import ts from "typescript";
import { CATALOG } from "./catalog.js";

/**
 * Self-verifiable registry: every catalog symbol must be a real export of its
 * @angular/material subpath. We resolve against the published .d.ts with tsc —
 * we do NOT `import` the components (that would execute Angular decorator code).
 */
export function verifyMaterialCatalog(): void {
  const lines = Object.values(CATALOG).map(
    (e, i) => `import type { ${e.symbol} as _${i} } from "${e.importPath}";`,
  );
  const source = lines.join("\n");
  const fileName = "verify-catalog.check.ts";
  const host = ts.createCompilerHost({});
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, langVersion, onError, shouldCreate) =>
    name === fileName
      ? ts.createSourceFile(name, source, langVersion, true)
      : original(name, langVersion, onError, shouldCreate);
  const program = ts.createProgram(
    [fileName],
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    },
    host,
  );
  const diags = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.code === 2307 || d.code === 2305 || d.code === 2724); // module/member not found
  if (diags.length > 0) {
    const msg = diags
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("; ");
    throw new Error(`material catalog self-verification failed: ${msg}`);
  }
}
```

- [ ] **Step 5: Run the catalog test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/catalog.test.ts`
Expected: 3 passing. (If a symbol name is wrong for the installed `@angular/material` version, the self-verification test names it — fix the catalog row.)

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @boyscout/bridge-material typecheck` → clean.

```bash
git add packages/bridges/bridge-material/src/catalog.ts packages/bridges/bridge-material/src/params.ts packages/bridges/bridge-material/src/verify-catalog.ts packages/bridges/bridge-material/test/catalog.test.ts
git commit -m "feat(sp6): material registry catalog + self-verification against @angular/material"
```

---

### Task 3: Component provider (declarative)

Turn a `component` feature's AST into a standalone Angular component with an inline template built from Material catalog selectors. Mirrors the Astryx component provider (imports collected from used node types, deterministic sorted attributes, escaped text).

**Files:**
- Create: `packages/bridges/bridge-material/templates/component.ts.eta`
- Create: `packages/bridges/bridge-material/src/component-provider.ts`
- Test: `packages/bridges/bridge-material/test/component-provider.test.ts`

**Interfaces:**
- Consumes: `CATALOG`, `TEXT_CHILD` from `./catalog.js`; `pascal`, `kebab` from `./naming.js`; `render` from `@boyscout/codegen`; `byteCompare` from `@boyscout/determinism`.
- Produces: `componentProvider: Provider` (capability `"component"`); `escapeAttr`, `escapeText`, `renderNode` (internal, exported for tests).

- [ ] **Step 1: Create the template `templates/component.ts.eta`**

```
import { Component } from "@angular/core";
<% it.imports.forEach(function (im) { %>import { <%= im.symbol %> } from "<%= im.importPath %>";
<% }) %>
@Component({
  standalone: true,
  selector: "<%= it.selector %>",
  imports: [<%= it.importList %>],
  template: `<%= it.body %>`,
})
export class <%= it.className %> {}
```

- [ ] **Step 2: Write the failing test**

`packages/bridges/bridge-material/test/component-provider.test.ts`:

```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/component-provider.js";

const feature: FeatureT = {
  id: "user-card",
  capability: "component",
  tree: {
    type: "Card",
    children: [
      { type: "CardTitle", props: { text: "Profile & <Overview>" } },
      { type: "CardContent", children: [{ type: "List", children: [{ type: "ListItem", props: { text: "Alice" } }] }] },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("componentProvider", () => {
  it("emits one non-durable standalone component asset", () => {
    const assets = componentProvider.generate(feature);
    expect(assets).toHaveLength(1);
    const a = assets[0];
    expect(a?.path).toBe("components/UserCard.ts");
    expect(a?.durable).toBeFalsy();
  });

  it("uses Material selectors, imports used symbols, escapes text", () => {
    const c = componentProvider.generate(feature)[0]?.content ?? "";
    expect(c).toContain('selector: "user-card"');
    expect(c).toContain("export class UserCard");
    expect(c).toContain("<mat-card>");
    expect(c).toContain("<mat-card-title>");
    expect(c).toContain('import { MatCard } from "@angular/material/card"');
    expect(c).toContain('import { MatList } from "@angular/material/list"');
    // text is HTML-escaped
    expect(c).toContain("Profile &amp; &lt;Overview&gt;");
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run packages/bridges/bridge-material/test/component-provider.test.ts`

- [ ] **Step 4: Implement `src/component-provider.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import { byteCompare } from "@boyscout/determinism";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { CATALOG, TEXT_CHILD } from "./catalog.js";
import { kebab, pascal } from "./naming.js";

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/component.ts.eta", import.meta.url)),
  "utf8",
);

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function selectorOf(type: string): string {
  const entry = CATALOG[type];
  if (!entry) throw new Error(`unknown material component node type "${type}"`);
  return entry.selector;
}

function renderAttrs(props: Record<string, unknown>): string {
  const keys = Object.keys(props)
    .filter((k) => k !== "text")
    .sort(byteCompare);
  return keys.map((k) => `${k}="${escapeAttr(String(props[k]))}"`).join(" ");
}

function renderNode(node: AstNodeT): string {
  const sel = selectorOf(node.type);
  const props = node.props ?? {};
  const attrs = renderAttrs(props);
  const open = attrs ? `<${sel} ${attrs}>` : `<${sel}>`;
  let inner = "";
  if (TEXT_CHILD.has(node.type) && typeof props.text === "string") {
    inner = escapeText(props.text);
  } else if (node.children) {
    inner = node.children.map(renderNode).join("");
  }
  return `${open}${inner}</${sel}>`;
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
    const symbols = [...used]
      .sort(byteCompare)
      .map((t) => {
        const entry = CATALOG[t];
        if (!entry) throw new Error(`unknown material component node type "${t}"`);
        return { symbol: entry.symbol, importPath: entry.importPath };
      });
    const className = pascal(feature.id);
    const content = render(TEMPLATE, {
      imports: symbols,
      importList: symbols.map((s) => s.symbol).join(", "),
      selector: kebab(feature.id),
      className,
      body: renderNode(feature.tree),
    });
    return [{ path: `components/${className}.ts`, content, durable: false }];
  },
};
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/component-provider.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `pnpm --filter @boyscout/bridge-material typecheck` → clean; `npx biome lint packages/bridges/bridge-material` → clean.

```bash
git add packages/bridges/bridge-material/templates/component.ts.eta packages/bridges/bridge-material/src/component-provider.ts packages/bridges/bridge-material/test/component-provider.test.ts
git commit -m "feat(sp6): material component provider (standalone Angular component)"
```

---

### Task 4: Form provider (declarative)

A `form` feature becomes a standalone Angular component holding a typed reactive `FormGroup` built with `NonNullableFormBuilder`. Fields come from `Field` AST children.

**Files:**
- Create: `packages/bridges/bridge-material/templates/form.ts.eta`
- Create: `packages/bridges/bridge-material/src/form-provider.ts`
- Test: `packages/bridges/bridge-material/test/form-provider.test.ts`

**Interfaces:**
- Consumes: `pascal`, `kebab` from `./naming.js`; `render`; `byteCompare`.
- Produces: `formProvider: Provider` (capability `"form"`); `FORM_NODE_TYPES: readonly string[]` (= `["Form", "Field"]`).

- [ ] **Step 1: Create `templates/form.ts.eta`**

```
import { Component, inject } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";

@Component({
  standalone: true,
  selector: "<%= it.selector %>",
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `<%= it.body %>`,
})
export class <%= it.className %> {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly form = this.fb.group({
<% it.fields.forEach(function (f) { %>    <%= f.name %>: this.fb.control<<%= f.tsType %>>(<%= f.initial %>),
<% }) %>  });
}
```

- [ ] **Step 2: Write the failing test**

`packages/bridges/bridge-material/test/form-provider.test.ts`:

```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { formProvider } from "../src/form-provider.js";

const feature: FeatureT = {
  id: "signup-form",
  capability: "form",
  tree: {
    type: "Form",
    props: { name: "Signup" },
    children: [
      { type: "Field", props: { name: "email", label: "Email", type: "text" } },
      { type: "Field", props: { name: "age", label: "Age", type: "number" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("formProvider", () => {
  it("emits one non-durable standalone form component", () => {
    const assets = formProvider.generate(feature);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe("components/SignupForm.ts");
    expect(assets[0]?.durable).toBeFalsy();
  });

  it("builds a typed FormGroup with a control per field", () => {
    const c = formProvider.generate(feature)[0]?.content ?? "";
    expect(c).toContain('selector: "signup-form"');
    expect(c).toContain("NonNullableFormBuilder");
    expect(c).toContain("email: this.fb.control<string>");
    expect(c).toContain("age: this.fb.control<number>");
    expect(c).toContain("<mat-form-field>");
    expect(c).toContain('formControlName="email"');
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run packages/bridges/bridge-material/test/form-provider.test.ts`

- [ ] **Step 4: Implement `src/form-provider.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { kebab, pascal } from "./naming.js";

export const FORM_NODE_TYPES: readonly string[] = ["Form", "Field"];

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/form.ts.eta", import.meta.url)),
  "utf8",
);

interface Field {
  name: string;
  label: string;
  inputType: string;
  tsType: string;
  initial: string;
}

function fieldsOf(tree: AstNodeT): Field[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Field")
    .map((c) => {
      const p = c.props ?? {};
      const inputType = String(p.type ?? "text");
      const isNumber = inputType === "number";
      return {
        name: String(p.name ?? ""),
        label: String(p.label ?? ""),
        inputType,
        tsType: isNumber ? "number" : "string",
        initial: isNumber ? "0" : '""',
      };
    });
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderBody(fields: Field[]): string {
  const controls = fields
    .map(
      (f) =>
        `<mat-form-field><mat-label>${escapeText(f.label)}</mat-label>` +
        `<input matInput type="${f.inputType}" formControlName="${f.name}"></mat-form-field>`,
    )
    .join("");
  return `<form [formGroup]="form">${controls}<button mat-button type="submit">Submit</button></form>`;
}

export const formProvider: Provider = {
  capability: "form",
  generate(feature: FeatureT): Asset[] {
    const fields = fieldsOf(feature.tree);
    const className = pascal(feature.id);
    const content = render(TEMPLATE, {
      selector: kebab(feature.id),
      className,
      fields,
      body: renderBody(fields),
    });
    return [{ path: `components/${className}.ts`, content, durable: false }];
  },
};
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/form-provider.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
git add packages/bridges/bridge-material/templates/form.ts.eta packages/bridges/bridge-material/src/form-provider.ts packages/bridges/bridge-material/test/form-provider.test.ts
git commit -m "feat(sp6): material form provider (typed reactive FormGroup)"
```

---

### Task 5: Route provider (declarative)

A `route` feature becomes an exported Angular `Routes` array with lazy `loadComponent` entries.

**Files:**
- Create: `packages/bridges/bridge-material/templates/route.ts.eta`
- Create: `packages/bridges/bridge-material/src/route-provider.ts`
- Test: `packages/bridges/bridge-material/test/route-provider.test.ts`

**Interfaces:**
- Consumes: `pascal`, `kebab` from `./naming.js`; `render`.
- Produces: `routeProvider: Provider` (capability `"route"`); `ROUTE_NODE_TYPES: readonly string[]` (= `["Routes", "Route"]`).

- [ ] **Step 1: Create `templates/route.ts.eta`**

```
import type { Routes } from "@angular/router";

export const <%= it.constName %>: Routes = [
<% it.routes.forEach(function (r) { %>  { path: "<%= r.path %>", loadComponent: () => import("<%= r.importPath %>").then((m) => m.<%= r.className %>) },
<% }) %>];
```

- [ ] **Step 2: Write the failing test**

`packages/bridges/bridge-material/test/route-provider.test.ts`:

```ts
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
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run packages/bridges/bridge-material/test/route-provider.test.ts`

- [ ] **Step 4: Implement `src/route-provider.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const ROUTE_NODE_TYPES: readonly string[] = ["Routes", "Route"];

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/route.ts.eta", import.meta.url)),
  "utf8",
);

interface Route {
  path: string;
  className: string;
  importPath: string;
}

function routesOf(tree: AstNodeT): Route[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Route")
    .map((c) => {
      const p = c.props ?? {};
      const className = String(p.component ?? "");
      return {
        path: String(p.path ?? ""),
        className,
        importPath: `../components/${className}.js`,
      };
    });
}

export const routeProvider: Provider = {
  capability: "route",
  generate(feature: FeatureT): Asset[] {
    const content = render(TEMPLATE, {
      constName: camel(feature.id),
      routes: routesOf(feature.tree),
    });
    return [{ path: `routes/${kebab(feature.id)}.routes.ts`, content, durable: false }];
  },
};
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/route-provider.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
git add packages/bridges/bridge-material/templates/route.ts.eta packages/bridges/bridge-material/src/route-provider.ts packages/bridges/bridge-material/test/route-provider.test.ts
git commit -m "feat(sp6): material route provider (Angular Routes with lazy loadComponent)"
```

---

### Task 6: Http provider (logic-bearing) + Angular seam

An `http` feature becomes an `@Injectable` `HttpClient` service scaffold (disposable) that binds to a durable human-owned transforms stub. Drift → compile error (proven by the seam contract in Task 8). Mirror the exact structure validated by the Task 1 smoke test.

> **If Task 1's contingency fired** (plain-TS contract file), adjust the scaffold to emit the interface into a separate `.running/http/<name>.contract.ts` and import it from both the service and the stub, per that task's report. Otherwise implement as below.

**Files:**
- Create: `packages/bridges/bridge-material/templates/http.service.ts.eta`
- Create: `packages/bridges/bridge-material/templates/http.transforms.ts.eta`
- Create: `packages/bridges/bridge-material/src/http-provider.ts`
- Test: `packages/bridges/bridge-material/test/http-provider.test.ts`

**Interfaces:**
- Consumes: `pascal`, `camel`, `kebab` from `./naming.js`; `render`.
- Produces: `httpProvider: Provider` (capability `"http"`); `HTTP_NODE_TYPES: readonly string[]` (= `["Http", "Endpoint"]`); `httpSeam(feature: FeatureT): SeamContractT`.

- [ ] **Step 1: Create `templates/http.service.ts.eta`**

```
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map, type Observable } from "rxjs";
import { <%= it.transformsName %> } from "<%= it.importSpecifier %>";

export interface <%= it.transformsInterface %> {
<% it.endpoints.forEach(function (e) { %>  <%= e.name %>(raw: unknown): <%= e.response %>;
<% }) %>}

const transforms: <%= it.transformsInterface %> = <%= it.transformsName %>;

@Injectable({ providedIn: "root" })
export class <%= it.serviceClass %> {
  private readonly http = inject(HttpClient);
<% it.endpoints.forEach(function (e) { %>
  <%= e.name %>(): Observable<<%= e.response %>> {
    return this.http.request<unknown>(<%= e.methodLiteral %>, <%= e.pathLiteral %>).pipe(map((raw) => transforms.<%= e.name %>(raw)));
  }
<% }) %>}
```

- [ ] **Step 2: Create `templates/http.transforms.ts.eta`**

```
export const <%= it.transformsName %> = {
<% it.endpoints.forEach(function (e) { %>  <%= e.name %>(raw: unknown): <%= e.response %> {
    throw new Error("not implemented: <%= e.name %> transform");
  },
<% }) %>};
```

- [ ] **Step 3: Write the failing test**

`packages/bridges/bridge-material/test/http-provider.test.ts`:

```ts
import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
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
});
```

- [ ] **Step 4: Run it — expect FAIL**

Run: `npx vitest run packages/bridges/bridge-material/test/http-provider.test.ts`

- [ ] **Step 5: Implement `src/http-provider.ts`**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab, pascal } from "./naming.js";

export const HTTP_NODE_TYPES: readonly string[] = ["Http", "Endpoint"];

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/http.service.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/http.transforms.ts.eta", import.meta.url)),
  "utf8",
);

interface Endpoint {
  name: string;
  method: string;
  path: string;
  methodLiteral: string;
  pathLiteral: string;
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
        methodLiteral: JSON.stringify(method),
        pathLiteral: JSON.stringify(path),
        response: String(p.response ?? "unknown"),
      };
    });
}

export function httpSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `http/${kebab(name)}.transforms.ts`,
    typedSignature: `${pascal(name)}Transforms`,
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
      serviceClass: `${pascal(name)}Service`,
      transformsName: `${camel(name)}Transforms`,
      transformsInterface: `${pascal(name)}Transforms`,
      importSpecifier: `../../src/http/${kebab(name)}.transforms.js`,
    };
    return [
      { path: `http/${pascal(name)}.service.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: httpSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
```

- [ ] **Step 6: Run test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/http-provider.test.ts`
Expected: 3 passing.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
git add packages/bridges/bridge-material/templates/http.service.ts.eta packages/bridges/bridge-material/templates/http.transforms.ts.eta packages/bridges/bridge-material/src/http-provider.ts packages/bridges/bridge-material/test/http-provider.test.ts
git commit -m "feat(sp6): material http provider (Angular HttpClient service + durable transforms seam)"
```

---

### Task 7: `materialOnly` guardrail + registry/bridge assembly

The design-system post-rule (analog of `astryxOnly`) plus the bridge/registry wiring that ties Tasks 2–6 together.

**Files:**
- Create: `packages/bridges/bridge-material/src/material-only.ts`
- Create: `packages/bridges/bridge-material/src/index.ts`
- Test: `packages/bridges/bridge-material/test/material-only.test.ts`
- Test: `packages/bridges/bridge-material/test/bridge.test.ts`

**Interfaces:**
- Consumes: `Asset`, `AssetRule`, `Bridge`, `BridgeRegistry` from `@boyscout/schemas`; `biomeLint` from `@boyscout/guardrails`; all providers + `CATALOG`, `COMPONENTS`, `paramsFor`, `FORM_NODE_TYPES`, `ROUTE_NODE_TYPES`, `HTTP_NODE_TYPES`.
- Produces: `materialOnly: AssetRule`; `registry: BridgeRegistry`; `bridge: Bridge`.

- [ ] **Step 1: Write the failing `materialOnly` test**

`packages/bridges/bridge-material/test/material-only.test.ts`:

```ts
import type { Asset } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { materialOnly } from "../src/material-only.js";

const asset = (content: string): Asset => ({ path: "components/X.ts", content });

describe("materialOnly", () => {
  it("passes a template using only Material selectors + irreducible form controls", () => {
    const c =
      '@Component({ template: `<mat-card><mat-card-title>Hi</mat-card-title></mat-card>` })';
    expect(materialOnly(asset(c))).toEqual([]);
  });

  it("permits the irreducible native form/interaction tags", () => {
    const c = '@Component({ template: `<form><input matInput><button mat-button>Go</button></form>` })';
    expect(materialOnly(asset(c))).toEqual([]);
  });

  it("flags a bare HTML layout primitive", () => {
    const c = '@Component({ template: `<div><mat-card></mat-card></div>` })';
    const violations = materialOnly(asset(c));
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("<div>");
  });

  it("ignores assets with no inline template (http/route)", () => {
    expect(materialOnly(asset("export const x = 1;"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run packages/bridges/bridge-material/test/material-only.test.ts`

- [ ] **Step 3: Implement `src/material-only.ts`**

```ts
import type { Asset, AssetRule } from "@boyscout/schemas";

// Irreducible native tags a Material form/interaction template must use.
const ALLOWED_NATIVE = new Set(["form", "input", "label", "button"]);

/**
 * Post-barrier design-system rule (analog of astryxOnly): inside an inline
 * Angular `template`, every element tag must be a Material selector (`mat-*`)
 * or one of the irreducible native controls. Bare HTML layout primitives
 * (div, span, h1, ...) are violations. Assets without a `template:` are skipped.
 */
export const materialOnly: AssetRule = (asset: Asset): string[] => {
  if (!/\btemplate\s*:/.test(asset.content)) return [];
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const m of asset.content.matchAll(/<([a-zA-Z][\w-]*)/g)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (tag.startsWith("mat-") || ALLOWED_NATIVE.has(tag)) continue;
    violations.push(`${asset.path}: non-design-system element <${tag}>`);
  }
  return violations;
};
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material/test/material-only.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Implement `src/index.ts`**

```ts
import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { COMPONENTS, paramsFor } from "./catalog.js";
import { componentProvider } from "./component-provider.js";
import { FORM_NODE_TYPES, formProvider } from "./form-provider.js";
import { HTTP_NODE_TYPES, httpProvider } from "./http-provider.js";
import { materialOnly } from "./material-only.js";
import { ROUTE_NODE_TYPES, routeProvider } from "./route-provider.js";

export { CATALOG, COMPONENTS } from "./catalog.js";
export { verifyMaterialCatalog } from "./verify-catalog.js";
export { httpSeam } from "./http-provider.js";

export const registry: BridgeRegistry = {
  capabilities: ["component", "form", "route", "http"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "form"
        ? FORM_NODE_TYPES
        : capability === "route"
          ? ROUTE_NODE_TYPES
          : capability === "http"
            ? HTTP_NODE_TYPES
            : [],
  paramsFor,
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "form"
        ? formProvider
        : capability === "route"
          ? routeProvider
          : capability === "http"
            ? httpProvider
            : undefined,
};

export const bridge: Bridge = {
  id: "material",
  platform: "angular",
  registry,
  postRules: [materialOnly, biomeLint],
};
```

- [ ] **Step 6: Write the bridge-assembly test**

`packages/bridges/bridge-material/test/bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { bridge, registry } from "../src/index.js";

describe("material bridge assembly", () => {
  it("declares material/angular identity and all four capabilities", () => {
    expect(bridge.id).toBe("material");
    expect(bridge.platform).toBe("angular");
    for (const cap of ["component", "form", "route", "http"]) {
      expect(registry.capabilities).toContain(cap);
      expect(registry.providerFor(cap)?.capability).toBe(cap);
    }
    expect(registry.providerFor("nope")).toBeUndefined();
  });

  it("carries both post-barrier rules (design-system + biome lint)", () => {
    expect(bridge.postRules.length).toBeGreaterThanOrEqual(2);
  });

  it("nodeTypesFor bounds each capability; unknown -> []", () => {
    expect(registry.nodeTypesFor("component")).toContain("Card");
    expect(registry.nodeTypesFor("http")).toEqual(["Http", "Endpoint"]);
    expect(registry.nodeTypesFor("nope")).toEqual([]);
  });
});
```

- [ ] **Step 7: Run all bridge-material tests — expect PASS**

Run: `npx vitest run packages/bridges/bridge-material`
Expected: all passing.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm --filter @boyscout/bridge-material typecheck` → clean; `npx biome lint packages/bridges/bridge-material` → clean.

```bash
git add packages/bridges/bridge-material/src/material-only.ts packages/bridges/bridge-material/src/index.ts packages/bridges/bridge-material/test/material-only.test.ts packages/bridges/bridge-material/test/bridge.test.ts
git commit -m "feat(sp6): materialOnly guardrail + material bridge/registry assembly"
```

---

### Task 8: Shared `@boyscout/bridge-contract-kit` + Astryx retrofit + Material contract tests

Extract the registry + seam contract assertions into one test-only kit both bridges run — so "identical contract suite" holds by construction. Retrofit Astryx's two contract tests onto the kit, then add Material's.

**Files:**
- Create: `packages/bridge-contract-kit/package.json`
- Create: `packages/bridge-contract-kit/tsconfig.json`
- Create: `packages/bridge-contract-kit/src/index.ts`
- Test: `packages/bridge-contract-kit/test/hygiene.test.ts`
- Modify (rewrite): `packages/bridges/bridge-astryx-react/test/registry-contract.test.ts`
- Modify (rewrite): `packages/bridges/bridge-astryx-react/test/seam-contract.test.ts`
- Create: `packages/bridges/bridge-material/test/registry-contract.test.ts`
- Create: `packages/bridges/bridge-material/test/seam-contract.test.ts`
- Modify: `packages/bridges/bridge-astryx-react/package.json` (add `@boyscout/bridge-contract-kit` devDependency)
- Modify: `packages/bridges/bridge-material/package.json` (add `@boyscout/bridge-contract-kit` devDependency)

**Interfaces:**
- Produces from `@boyscout/bridge-contract-kit`:
  - `runRegistryContract(bridge: Bridge, opts: { expectedId: string; expectedPlatform: string; capabilities: readonly string[]; minPostRules: number; verifyCatalog: () => void | Promise<void> }): void`
  - `runSeamContract(opts: { pkgRoot: string; compilerOptions: ts.CompilerOptions; fixtures: SeamFixture[] }): void`
  - `type SeamFixture = { label: string; assets: Asset[]; driftedContent: string }` — the drift reuses the generated durable stub's real path (so the scaffold's import always resolves; only the human logic's type drifts)
  - `PLAIN_TS_OPTS: ts.CompilerOptions`, `ANGULAR_OPTS: ts.CompilerOptions` (shared option presets)

- [ ] **Step 1: Create `packages/bridge-contract-kit/package.json`**

```json
{
  "name": "@boyscout/bridge-contract-kit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@boyscout/schemas": "workspace:*",
    "typescript": "5.9.3"
  },
  "devDependencies": {
    "vitest": "4.1.10"
  }
}
```

> `vitest` is also hoisted from the repo root; the explicit devDependency keeps the kit self-describing. Match the root `package.json` version (4.1.10 at time of writing) if it has moved.

- [ ] **Step 2: Create `packages/bridge-contract-kit/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Implement `packages/bridge-contract-kit/src/index.ts`**

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Asset, Bridge } from "@boyscout/schemas";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

/** Plain-TS options (fetch clients etc.) — the Astryx seam profile. */
export const PLAIN_TS_OPTS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};

/** Angular options (decorators + DOM libs) — the Material seam profile. */
export const ANGULAR_OPTS: ts.CompilerOptions = {
  ...PLAIN_TS_OPTS,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
};

export interface SeamFixture {
  label: string;
  assets: Asset[];
  /** Human logic whose type drifts from the contract; written at the durable stub's own path. */
  driftedContent: string;
}

/**
 * Registry contract: identity, provider resolution, post-rule count, and a
 * bridge-supplied catalog self-verification. Called at a test file's top level.
 */
export function runRegistryContract(
  bridge: Bridge,
  opts: {
    expectedId: string;
    expectedPlatform: string;
    capabilities: readonly string[];
    minPostRules: number;
    verifyCatalog: () => void | Promise<void>;
  },
): void {
  describe(`${opts.expectedId} registry contract`, () => {
    it("declares identity and resolves a provider per capability", () => {
      expect(bridge.id).toBe(opts.expectedId);
      expect(bridge.platform).toBe(opts.expectedPlatform);
      for (const cap of opts.capabilities) {
        expect(bridge.registry.providerFor(cap)?.capability).toBe(cap);
      }
      expect(bridge.registry.providerFor("nope")).toBeUndefined();
    });
    it("carries at least the required post-barrier rules", () => {
      expect(bridge.postRules.length).toBeGreaterThanOrEqual(opts.minPostRules);
    });
    it("self-verifies its catalog against the real framework", async () => {
      await opts.verifyCatalog();
    });
  });
}

/**
 * Seam contract (D2d): the generated scaffold pins the human logic — the
 * generated durable stub compiles (0 diagnostics), a drifted stub does not.
 * Temp fixtures are written under `pkgRoot` so framework types resolve via
 * upward node_modules lookup.
 */
export function runSeamContract(opts: {
  pkgRoot: string;
  compilerOptions: ts.CompilerOptions;
  fixtures: SeamFixture[];
}): void {
  const tmps: string[] = [];
  const diagnose = (
    scaffold: { path: string; content: string },
    stub: { path: string; content: string },
  ): readonly ts.Diagnostic[] => {
    const dir = mkdtempSync(join(opts.pkgRoot, ".contract-tmp-"));
    tmps.push(dir);
    const scaffoldPath = join(dir, ".running", scaffold.path);
    const stubPath = join(dir, "src", stub.path);
    mkdirSync(dirname(scaffoldPath), { recursive: true });
    mkdirSync(dirname(stubPath), { recursive: true });
    writeFileSync(scaffoldPath, scaffold.content);
    writeFileSync(stubPath, stub.content);
    const program = ts.createProgram([scaffoldPath, stubPath], opts.compilerOptions);
    return ts.getPreEmitDiagnostics(program);
  };

  describe("seam contract: matching stub compiles, drifted stub fails (D2d)", () => {
    afterEach(() => {
      while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
    });
    for (const fx of opts.fixtures) {
      const scaffold = fx.assets.find((a) => !a.durable);
      const stub = fx.assets.find((a) => a.durable);
      it(`${fx.label} — generated stub satisfies the generated contract`, () => {
        if (!scaffold || !stub) throw new Error(`fixture "${fx.label}" needs scaffold + durable stub`);
        expect(diagnose(scaffold, stub)).toHaveLength(0);
      });
      it(`${fx.label} — a drifted stub is a compile error`, () => {
        if (!scaffold || !stub) throw new Error(`fixture "${fx.label}" needs scaffold + stub`);
        // Reuse the durable stub's real path so the scaffold's import resolves; only the type drifts.
        expect(diagnose(scaffold, { path: stub.path, content: fx.driftedContent }).length).toBeGreaterThan(0);
      });
    }
  });
}
```

- [ ] **Step 4: Write the kit hygiene test** (mirrors runtime's agnosticism invariant)

`packages/bridge-contract-kit/test/hygiene.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("contract kit is bridge-agnostic", () => {
  it("the kit source imports no concrete bridge", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/astryx|bridge-material|bridge-astryx/);
  });

  it("the kit package declares no bridge dependency", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const leaks = Object.keys(pkg.dependencies ?? {}).filter((d) => d.includes("bridge"));
    expect(leaks).toEqual([]);
  });
});
```

- [ ] **Step 5: Add the kit as a devDependency to both bridges + install**

Add `"@boyscout/bridge-contract-kit": "workspace:*"` to `devDependencies` in both `packages/bridges/bridge-astryx-react/package.json` and `packages/bridges/bridge-material/package.json`.

Run: `pnpm install`

- [ ] **Step 6: Run kit hygiene test — expect PASS**

Run: `npx vitest run packages/bridge-contract-kit`
Expected: 2 passing.

- [ ] **Step 7: Rewrite Astryx `registry-contract.test.ts` onto the kit**

`packages/bridges/bridge-astryx-react/test/registry-contract.test.ts` (replace entire file):

```ts
import { runRegistryContract } from "@boyscout/bridge-contract-kit";
import { COMPONENTS } from "../src/catalog.js";
import { bridge } from "../src/index.js";

runRegistryContract(bridge, {
  expectedId: "astryx-react",
  expectedPlatform: "react",
  capabilities: ["component", "service", "store", "http"],
  minPostRules: 2,
  verifyCatalog: async () => {
    const { expect } = await import("vitest");
    const mod = (await import("@astryxdesign/core")) as Record<string, unknown>;
    for (const name of COMPONENTS) {
      expect(mod[name], `${name} missing from @astryxdesign/core`).toBeDefined();
    }
  },
});
```

- [ ] **Step 8: Rewrite Astryx `seam-contract.test.ts` onto the kit**

`packages/bridges/bridge-astryx-react/test/seam-contract.test.ts` (replace entire file):

```ts
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
```

> The drift content mirrors the shapes the Astryx providers emit (the drift reuses each generated durable stub's real path, so the scaffold import resolves and only the return type drifts). This is exactly the pre-retrofit behavior — same 6 assertions.

- [ ] **Step 9: Run the retrofitted Astryx contract tests — expect PASS (unchanged behavior)**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/registry-contract.test.ts packages/bridges/bridge-astryx-react/test/seam-contract.test.ts`
Expected: same green as before the retrofit (registry + 6 seam assertions).

- [ ] **Step 10: Add Material `registry-contract.test.ts`**

`packages/bridges/bridge-material/test/registry-contract.test.ts`:

```ts
import { runRegistryContract } from "@boyscout/bridge-contract-kit";
import { bridge } from "../src/index.js";
import { verifyMaterialCatalog } from "../src/verify-catalog.js";

runRegistryContract(bridge, {
  expectedId: "material",
  expectedPlatform: "angular",
  capabilities: ["component", "form", "route", "http"],
  minPostRules: 2,
  verifyCatalog: () => verifyMaterialCatalog(),
});
```

- [ ] **Step 11: Add Material `seam-contract.test.ts`**

`packages/bridges/bridge-material/test/seam-contract.test.ts`:

```ts
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
      { type: "Endpoint", props: { name: "getUsers", method: "GET", path: "/users", response: "string[]" } },
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
```

- [ ] **Step 12: Run the full contract suite on both bridges — expect PASS (the proof)**

Run: `npx vitest run packages/bridges/bridge-material packages/bridges/bridge-astryx-react packages/bridge-contract-kit`
Expected: all passing — same kit, two frameworks.

- [ ] **Step 13: Typecheck, lint, commit**

Run: `pnpm --filter @boyscout/bridge-contract-kit typecheck && pnpm --filter @boyscout/bridge-material typecheck && pnpm --filter @boyscout/bridge-astryx-react typecheck` → clean.
Run: `npx biome lint packages` → clean.

```bash
git add packages/bridge-contract-kit packages/bridges/bridge-astryx-react/test/registry-contract.test.ts packages/bridges/bridge-astryx-react/test/seam-contract.test.ts packages/bridges/bridge-material/test/registry-contract.test.ts packages/bridges/bridge-material/test/seam-contract.test.ts packages/bridges/bridge-astryx-react/package.json packages/bridges/bridge-material/package.json pnpm-lock.yaml
git commit -m "feat(sp6): shared bridge-contract-kit; retrofit Astryx + add Material contract suites"
```

---

### Task 9: CLI bridge selection

Route `boyscout generate` to the bridge named by `config.bridge`, so a Material project generates governed Angular. The Runtime's existing `config.bridge === bridge.id` and `spec.metadata` cross-checks then guard mismatches with no new code.

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/package.json` (add `@boyscout/bridge-material` dependency)
- Test: `apps/cli/test/bridge-selection.test.ts`

**Interfaces:**
- Produces: `selectBridge(id: string): Bridge | undefined` (exported from `apps/cli/src/main.ts`).

- [ ] **Step 1: Add the dependency**

Add `"@boyscout/bridge-material": "workspace:*"` to `dependencies` in `apps/cli/package.json`, then `pnpm install`.

- [ ] **Step 2: Write the failing test**

`apps/cli/test/bridge-selection.test.ts`:

```ts
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";
import { selectBridge } from "../src/main.js";

describe("selectBridge", () => {
  it("maps config bridge ids to bridge instances", () => {
    expect(selectBridge("astryx-react")).toBe(astryxBridge);
    expect(selectBridge("material")).toBe(materialBridge);
    expect(selectBridge("nope")).toBeUndefined();
  });
});

describe("material generation via the runtime (agnostic, unchanged runtime)", () => {
  const config = loadConfig(
    "platform: angular\nbridge: material\ncapabilities:\n  - component\n",
  );
  const spec = {
    version: "1",
    features: [
      {
        id: "user-card",
        capability: "component",
        tree: { type: "Card", children: [{ type: "CardTitle", props: { text: "Hi" } }] },
        annotations: {},
        props: {},
        approved: true,
      },
    ],
    metadata: { bridge: "material", platform: "angular", checksum: "" },
  };

  it("generates an Angular component asset", () => {
    const assets = buildAssets({ specInput: spec, config, bridge: materialBridge });
    expect(assets[0]?.path).toBe("components/UserCard.ts");
    expect(assets[0]?.content).toContain("@Component");
  });

  it("fails the runtime cross-check when spec metadata names another bridge", () => {
    const mismatched = { ...spec, metadata: { ...spec.metadata, bridge: "astryx-react" } };
    expect(() => buildAssets({ specInput: mismatched, config, bridge: materialBridge })).toThrow();
  });
});
```

- [ ] **Step 3: Run it — expect FAIL** (`selectBridge` not exported)

Run: `npx vitest run apps/cli/test/bridge-selection.test.ts`

- [ ] **Step 4: Edit `apps/cli/src/main.ts`**

Add the import and `selectBridge`, and use it in `main()`. Replace the top-of-file bridge import and the `generate({... bridge ...})` call:

```ts
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { GateError, generate, loadConfig } from "@boyscout/runtime";
import type { Bridge } from "@boyscout/schemas";
import { authorCommand } from "./author/command.js";

const BRIDGES: Record<string, Bridge> = {
  "astryx-react": astryxBridge,
  material: materialBridge,
};

/** Resolve a bridge by its config id. Unknown id -> undefined. */
export function selectBridge(id: string): Bridge | undefined {
  return BRIDGES[id];
}
```

Then inside `main()`, after `const config = loadConfig(...)`:

```ts
    const config = loadConfig(readFileSync(configPath, "utf8"));
    const bridge = selectBridge(config.bridge);
    if (!bridge) {
      process.stderr.write(`unknown bridge: ${config.bridge}\n`);
      return 1;
    }
    const specInput = JSON.parse(readFileSync(specPath, "utf8"));
    const { emitted, preserved } = generate({
      specInput,
      config,
      bridge,
      outDir: dirname(specPath),
    });
```

> `apps/cli/src/author/command.ts` continues to import the Astryx `registry` unchanged — authoring/preview stays React/Astryx per D1.

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run apps/cli/test/bridge-selection.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Full CLI test run (no regressions) + typecheck + lint + commit**

Run: `npx vitest run apps/cli` → all passing.
Run: `pnpm --filter @boyscout/cli typecheck` → clean; `npx biome lint apps` → clean.

```bash
git add apps/cli/src/main.ts apps/cli/package.json apps/cli/test/bridge-selection.test.ts pnpm-lock.yaml
git commit -m "feat(sp6): CLI selects bridge by config.bridge (astryx-react | material)"
```

---

### Task 10: Cross-OS determinism golden for Material

Prove Material generation is byte-deterministic on the existing golden path: a fixture spec exercising all four capabilities generates byte-identical output, guarded by committed goldens.

**Files:**
- Create: `apps/cli/test/fixtures/material-config.yaml`
- Create: `apps/cli/test/fixtures/material-spec.json`
- Create: `apps/cli/test/material-golden.test.ts`
- Create (generated): `apps/cli/test/goldens/material/**`

**Interfaces:**
- Consumes: `bridge` from `@boyscout/bridge-material`; `buildAssets`, `loadConfig` from `@boyscout/runtime`; `hash`, `writeBytes` from `@boyscout/determinism`.

- [ ] **Step 1: Create `apps/cli/test/fixtures/material-config.yaml`**

```yaml
platform: angular
bridge: material
capabilities:
  - component
  - form
  - route
  - http
```

- [ ] **Step 2: Create `apps/cli/test/fixtures/material-spec.json`**

```json
{
  "version": "1",
  "features": [
    {
      "id": "user-card",
      "capability": "component",
      "tree": { "type": "Card", "children": [
        { "type": "CardTitle", "props": { "text": "Overview" } },
        { "type": "CardContent", "children": [ { "type": "List", "children": [ { "type": "ListItem", "props": { "text": "Alice" } } ] } ] }
      ] },
      "annotations": {},
      "props": {},
      "approved": true
    },
    {
      "id": "signup-form",
      "capability": "form",
      "tree": { "type": "Form", "props": { "name": "Signup" }, "children": [
        { "type": "Field", "props": { "name": "email", "label": "Email", "type": "text" } },
        { "type": "Field", "props": { "name": "age", "label": "Age", "type": "number" } }
      ] },
      "annotations": {},
      "props": {},
      "approved": true
    },
    {
      "id": "app-routes",
      "capability": "route",
      "tree": { "type": "Routes", "children": [
        { "type": "Route", "props": { "path": "users", "component": "UserCard" } }
      ] },
      "annotations": {},
      "props": {},
      "approved": true
    },
    {
      "id": "users-api",
      "capability": "http",
      "tree": { "type": "Http", "props": { "name": "UsersApi" }, "children": [
        { "type": "Endpoint", "props": { "name": "getUsers", "method": "GET", "path": "/users", "response": "string[]" } }
      ] },
      "annotations": {},
      "props": {},
      "approved": true
    }
  ],
  "metadata": { "bridge": "material", "platform": "angular", "checksum": "" }
}
```

- [ ] **Step 3: Create `apps/cli/test/material-golden.test.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-material";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: material scaffolds are byte-identical (scaffold only)", () => {
  it("every .running scaffold matches its committed golden; durables excluded", () => {
    const config = loadConfig(readFileSync(here("./fixtures/material-config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/material-spec.json"), "utf8"));
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);

    // 4 features -> component + form + route + http scaffold = 4 scaffolds (+ 1 durable http stub).
    expect(scaffolds).toHaveLength(4);

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/material/${asset.path}`);
      const actualBytes = writeBytes(asset.content);
      if (UPDATE) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, actualBytes);
        continue;
      }
      expect(existsSync(goldenPath), `missing golden for ${asset.path}`).toBe(true);
      expect(hash(actualBytes), `byte drift in ${asset.path}`).toBe(hash(readFileSync(goldenPath)));
    }
  });
});
```

- [ ] **Step 4: Generate the goldens**

Run: `UPDATE_GOLDENS=1 npx vitest run apps/cli/test/material-golden.test.ts`
Expected: creates `apps/cli/test/goldens/material/components/UserCard.ts`, `.../components/SignupForm.ts`, `.../routes/app-routes.routes.ts`, `.../http/UsersApi.service.ts`.

- [ ] **Step 5: Inspect the goldens**

Open each generated golden and sanity-check it is well-formed governed Angular (standalone `@Component`, typed `FormGroup`, `Routes` array, `@Injectable` service). Fix a template if anything is malformed, then regenerate (Step 4).

- [ ] **Step 6: Run the golden test in verify mode — expect PASS**

Run: `npx vitest run apps/cli/test/material-golden.test.ts`
Expected: 1 passing (byte-identical).

- [ ] **Step 7: Commit**

```bash
git add apps/cli/test/fixtures/material-config.yaml apps/cli/test/fixtures/material-spec.json apps/cli/test/material-golden.test.ts apps/cli/test/goldens/material
git commit -m "test(sp6): cross-OS determinism golden for material (all four capabilities)"
```

---

## Final verification (after all tasks)

- [ ] **Full test suite:** `pnpm -r exec vitest run` (or run each package's test dir) — all green.
- [ ] **Typecheck the workspace:** `pnpm -r typecheck` — clean.
- [ ] **Biome (CI-authoritative), scoped to avoid OOM:** `npx biome lint packages apps` — clean.
- [ ] **Format check:** `pnpm format:check` — clean (run `pnpm format` first if needed).
- [ ] **Agnosticism guard still holds:** `npx vitest run packages/runtime/test/agnosticism.test.ts` — runtime declares no bridge/framework dependency.

## Self-Review notes (plan author)

- **Spec coverage:** package + registry (T1,T2,T7) · self-verifiable catalog (T2) · component/form/route providers (T3,T4,T5) · logic-bearing http + Angular seam (T1 spike, T6) · materialOnly guardrail (T7) · shared contract kit + Astryx retrofit + Material contract tests (T8) · CLI bridge selection (T9) · determinism golden (T10) · runtime untouched (verified in final step). Non-goals (preview, Bridge Skill, service/store, app build) are not tasked — correct.
- **Risk:** the Angular-under-tsc seam is retired first (T1) with a documented fallback that T6/T8 reference.
- **Type consistency:** `CatalogEntry`, `httpSeam` shape (`srcPath`/`typedSignature`/`binding`), provider capability strings, and kit runner signatures are used identically across tasks. Durable http stub path `http/<kebab>.transforms.ts` and scaffold path `http/<Pascal>.service.ts` are consistent in T6, T8, T10.
