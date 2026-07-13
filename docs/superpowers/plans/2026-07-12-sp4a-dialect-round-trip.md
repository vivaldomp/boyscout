# SP4a — `@boyscout/dialect` `.openui` Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@boyscout/dialect` — a headless core package that projects the existing `Specification`/`AstNode` schema to and from a persisted `.openui` text file, byte-stable both directions (D10), and prove an authored `.openui` drives the real engine to byte-identical scaffolds.

**Architecture:** Three focused files — `parse.ts` (registry-free tokenizer + recursive-descent → raw structures), `bind.ts` (raw → `SpecificationT` via a registry-provided positional-param table + `validateSpec`), `serialize.ts` (`SpecificationT` → canonical text). Parsing is brace/paren-structural and whitespace-insignificant; the serializer owns all canonical formatting. The package imports no bridge and no react — a registry (`capabilities`/`nodeTypesFor`/`paramsFor`) is passed as a parameter, exactly like `validateSpec(input, registry)`. Two deferred untrusted-input prerequisites (Astryx provider escaping; zero-child logic-bearing guard) are folded in because authored text now reaches `generate`.

**Tech Stack:** raw-TS pnpm workspace package (strict TS 5.9.3, NodeNext, `exactOptionalPropertyTypes:true`, `exports:"./src/index.ts"`, no build step), Zod 4 (via `@boyscout/schemas`/`@boyscout/spec`), `@boyscout/determinism` (`writeBytes`), Vitest 4.

## Global Constraints

- **Agnosticism (§14.1):** `@boyscout/dialect` `src/` imports no bridge, no react, no `@astryxdesign/core`. Arg-order arrives via a registry parameter. Its dev-tests use a local mock registry, never the bridge.
- **Dialect deps:** only `@boyscout/schemas`, `@boyscout/determinism`, `@boyscout/spec`. No new third-party dependency (no `fast-check`).
- **Positional args, never keys (§17.1):** DSL node calls are positional; binding maps position→prop-name via `registry.paramsFor(nodeType)`.
- **Canonical-normalizing round-trip (D10):** `serializeOpenui` emits the one canonical form; parsing drops comments/whitespace/trivia. No comment preservation.
- **Determinism (D3a/D3b):** `.openui` bytes route through `@boyscout/determinism` `writeBytes` (LF/UTF-8/no-BOM). Serialization is deterministic-by-construction; cross-OS golden-tested.
- **Strict TS:** `exactOptionalPropertyTypes:true` — assign optional properties conditionally, never `x: value` where `value` may be `undefined`. Before every commit: `pnpm --filter <pkg> typecheck` (there is **no** per-package `test` script — run tests via `npx vitest run <path>` or root `pnpm test`).
- **SP4a-expressible subset:** the round-trip covers `metadata.{bridge,platform}`, `version`, and each feature's `{id, capability, tree}`. `approved` defaults `true`; `annotations`/feature-`props` default `{}`; `metadata.checksum` stays `""`. These are not projected into `.openui`.
- **The `paramsFor` table (authoritative — same values in the schema mock and the astryx bridge):**
  - component: `VStack→["gap"]`, `HStack→["gap"]`, `Card→[]`, `Grid→["columns"]`, `Heading→["level","text"]`, `Text→["type","text"]`, `Button→["variant","text"]`
  - service: `Service→["name"]`, `Method→["name","params","returns"]`
  - store: `Store→["name","state"]`, `Action→["name","payload"]`
  - http: `Http→["name"]`, `Endpoint→["name","method","path","response"]`

---

## File Structure

- **Create** `packages/dialect/package.json`, `packages/dialect/tsconfig.json`
- **Create** `packages/dialect/src/parse.ts` — tokenizer + parser → `RawFile`; `DialectError`; `parseOpenuiRaw`
- **Create** `packages/dialect/src/bind.ts` — `RawFile` → `SpecificationT`; `DialectRegistry` type; `bind`
- **Create** `packages/dialect/src/serialize.ts` — `SpecificationT` → canonical text; `serializeOpenui`
- **Create** `packages/dialect/src/index.ts` — public API: `parseOpenui`, `serializeOpenui`, re-exports
- **Create** `packages/dialect/test/mock-registry.ts`, `parse.test.ts`, `roundtrip.test.ts`
- **Modify** `packages/schemas/src/index.ts` — add `paramsFor` to `BridgeRegistry`
- **Create** `packages/bridges/bridge-astryx-react/src/params.ts` — `paramsFor` impl; **modify** `src/index.ts` to wire it
- **Modify** `packages/bridges/bridge-astryx-react/src/provider.ts` — JSX escaping
- **Modify** `packages/guardrails/src/index.ts` — zero-child logic-bearing guard
- **Create** `apps/cli/test/dialect-golden.test.ts`, `apps/cli/test/fixtures/dialect.openui`, `apps/cli/test/goldens/dialect/*`

---

## Task 1: Registry `paramsFor` contract + astryx implementation

**Files:**
- Modify: `packages/schemas/src/index.ts` (the `BridgeRegistry` interface, ~line 111)
- Create: `packages/bridges/bridge-astryx-react/src/params.ts`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (registry object)
- Modify: `packages/schemas/test/bridge-contract.test-d.ts` (full-registry literal, ~line 18)
- Modify: `packages/runtime/test/runtime.test.ts` (4 inline registry literals, ~lines 12, 81, 104, 133)
- Test: `packages/bridges/bridge-astryx-react/test/params.test.ts`

**Note:** `paramsFor` becomes a **required** `BridgeRegistry` method, so every full-registry literal in the repo must add it. `Pick<>`-based consumers (`checkExpressible`, `validateSpec`) are unaffected. The two test files above are the only full literals besides the real bridge.

**Interfaces:**
- Consumes: existing `BridgeRegistry { capabilities; nodeTypesFor; providerFor }`.
- Produces: `BridgeRegistry.paramsFor(nodeType: string): readonly string[]`; `registry.paramsFor` on the astryx bridge returns the authoritative table above; unknown type → `[]`.

- [ ] **Step 1: Write the failing test**

`packages/bridges/bridge-astryx-react/test/params.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { registry } from "../src/index.js";

describe("astryx registry paramsFor", () => {
  it("returns ordered positional params per node type", () => {
    expect(registry.paramsFor("Heading")).toEqual(["level", "text"]);
    expect(registry.paramsFor("Text")).toEqual(["type", "text"]);
    expect(registry.paramsFor("Button")).toEqual(["variant", "text"]);
    expect(registry.paramsFor("VStack")).toEqual(["gap"]);
    expect(registry.paramsFor("Card")).toEqual([]);
    expect(registry.paramsFor("Method")).toEqual(["name", "params", "returns"]);
    expect(registry.paramsFor("Endpoint")).toEqual(["name", "method", "path", "response"]);
  });
  it("returns [] for an unknown node type", () => {
    expect(registry.paramsFor("Nope")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/params.test.ts`
Expected: FAIL — `registry.paramsFor is not a function`.

- [ ] **Step 3: Add `paramsFor` to the `BridgeRegistry` interface**

In `packages/schemas/src/index.ts`, inside `export interface BridgeRegistry`, add the method after `nodeTypesFor`:
```ts
export interface BridgeRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];
  /** Ordered positional parameter names for an AST node type (SP4a DSL binding). Unknown type -> []. */
  paramsFor(nodeType: string): readonly string[];
  providerFor(capability: string): Provider | undefined;
}
```

- [ ] **Step 4: Create the astryx `paramsFor` table**

`packages/bridges/bridge-astryx-react/src/params.ts`:
```ts
/** Ordered positional parameter names per AST node type — the DSL binds positional args to these (SP4a). */
const PARAMS: Record<string, readonly string[]> = {
  // component
  VStack: ["gap"],
  HStack: ["gap"],
  Card: [],
  Grid: ["columns"],
  Heading: ["level", "text"],
  Text: ["type", "text"],
  Button: ["variant", "text"],
  // service
  Service: ["name"],
  Method: ["name", "params", "returns"],
  // store
  Store: ["name", "state"],
  Action: ["name", "payload"],
  // http
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export function paramsFor(nodeType: string): readonly string[] {
  return PARAMS[nodeType] ?? [];
}
```

- [ ] **Step 5: Wire it into the registry**

In `packages/bridges/bridge-astryx-react/src/index.ts`, add the import and the registry method:
```ts
import { paramsFor } from "./params.js";
```
Then inside the `export const registry: BridgeRegistry = {` object, add after the `nodeTypesFor` arrow (before `providerFor`):
```ts
  paramsFor,
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/params.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Add `paramsFor` to the full-registry test literals**

In `packages/schemas/test/bridge-contract.test-d.ts`, the `const registry: BridgeRegistry = { ... }` literal (~line 18) — add after its `nodeTypesFor` line:
```ts
    paramsFor: (_t: string): readonly string[] => [],
```
In `packages/runtime/test/runtime.test.ts`, each inline `registry: { ... }` literal (there are 4, ~lines 12, 81, 104, 133) — add a `paramsFor` member alongside its `nodeTypesFor`/`providerFor`:
```ts
        paramsFor: () => [],
```
(These are test mocks; an empty param list is fine — none of these tests exercise the dialect.)

- [ ] **Step 8: Typecheck the whole workspace**

Run: `pnpm -r typecheck`
Expected: no errors across all packages. (This catches any full-registry literal that still lacks `paramsFor`.)

- [ ] **Step 9: Commit**
```bash
git add packages/schemas/src/index.ts packages/bridges/bridge-astryx-react/src/params.ts packages/bridges/bridge-astryx-react/src/index.ts packages/bridges/bridge-astryx-react/test/params.test.ts packages/schemas/test/bridge-contract.test-d.ts packages/runtime/test/runtime.test.ts
git commit -m "feat(schemas,bridge): paramsFor — ordered positional param table per node type (SP4a)"
```

---

## Task 2: `@boyscout/dialect` package + parser (`text → RawFile`)

**Files:**
- Create: `packages/dialect/package.json`, `packages/dialect/tsconfig.json`
- Create: `packages/dialect/src/parse.ts`
- Test: `packages/dialect/test/parse.test.ts`

**Interfaces:**
- Consumes: nothing from other packages (registry-free, pure syntax).
- Produces:
  - `type Literal = string | number | boolean | null`
  - `interface RawNode { type: string; args: Literal[]; children: RawNode[]; line: number }`
  - `interface RawFeature { capability: string; id: string; node: RawNode; line: number }`
  - `interface RawFile { header: Record<string, string>; features: RawFeature[] }`
  - `class DialectError extends Error { readonly line: number }`
  - `function parseOpenuiRaw(src: string): RawFile`

- [ ] **Step 1: Create the package manifest and tsconfig**

`packages/dialect/package.json`:
```json
{
  "name": "@boyscout/dialect",
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
    "@boyscout/determinism": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "@boyscout/spec": "workspace:*"
  }
}
```
`packages/dialect/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```
Then run `pnpm install` so the workspace links the new package.
Run: `pnpm install`
Expected: lockfile updates; `@boyscout/dialect` linked.

- [ ] **Step 2: Write the failing test**

`packages/dialect/test/parse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DialectError, parseOpenuiRaw } from "../src/parse.js";

const SRC = `spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
`;

describe("parseOpenuiRaw", () => {
  it("parses header, feature, positional args, and nested children", () => {
    const file = parseOpenuiRaw(SRC);
    expect(file.header).toEqual({ version: "1", bridge: "astryx-react", platform: "react" });
    expect(file.features).toHaveLength(1);
    const f = file.features[0];
    expect(f.capability).toBe("component");
    expect(f.id).toBe("user-card");
    expect(f.node.type).toBe("Card");
    expect(f.node.args).toEqual([]);
    const vstack = f.node.children[0];
    expect(vstack.type).toBe("VStack");
    expect(vstack.args).toEqual([2]);
    expect(vstack.children.map((c) => c.type)).toEqual(["Heading", "Text", "Button"]);
    expect(vstack.children[0].args).toEqual([3, "Profile"]);
  });

  it("parses string escapes and boolean/null literals", () => {
    const file = parseOpenuiRaw(`spec version=1 bridge=b platform=p\ncomponent x =\n  Text("a \\"q\\" z", "y")\n`);
    expect(file.features[0].node.args).toEqual(['a "q" z', "y"]);
  });

  it("throws with a line number on an unterminated string", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Text("oops)\n`;
    expect(() => parseOpenuiRaw(bad)).toThrow(DialectError);
    try { parseOpenuiRaw(bad); } catch (e) { expect((e as DialectError).line).toBe(3); }
  });

  it("throws on an unexpected token where a literal is required", () => {
    expect(() => parseOpenuiRaw(`spec version=1 bridge=b platform=p\ncomponent x =\n  Text(body)\n`)).toThrow(
      /expected a literal/,
    );
  });

  it("throws on a brace/paren mismatch", () => {
    expect(() => parseOpenuiRaw(`spec version=1 bridge=b platform=p\ncomponent x =\n  Card {\n`)).toThrow(
      DialectError,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/dialect/test/parse.test.ts`
Expected: FAIL — cannot resolve `../src/parse.js`.

- [ ] **Step 4: Implement the parser**

`packages/dialect/src/parse.ts`:
```ts
/** SP4a .openui parser: text -> raw structures. Registry-free, pure syntax; trivia is dropped (canonical-normalizing). */

export type Literal = string | number | boolean | null;

export interface RawNode {
  type: string;
  args: Literal[];
  children: RawNode[];
  line: number;
}
export interface RawFeature {
  capability: string;
  id: string;
  node: RawNode;
  line: number;
}
export interface RawFile {
  header: Record<string, string>;
  features: RawFeature[];
}

export class DialectError extends Error {
  constructor(
    message: string,
    public readonly line: number,
  ) {
    super(`${message} (line ${line})`);
    this.name = "DialectError";
  }
}

interface Token {
  kind: "ident" | "string" | "number" | "punct" | "keyword";
  value: string;
  num: number;
  line: number;
}

const KEYWORDS = new Set(["true", "false", "null"]);
const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_-]/;
const DIGIT = /[0-9]/;

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  const n = src.length;
  // NOTE: noUncheckedIndexedAccess is on — use src.charAt(k) (always returns string, "" past end)
  // rather than src[k] (which types as string | undefined) for all character reads.
  while (i < n) {
    const c = src.charAt(i);
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "(" || c === ")" || c === "{" || c === "}" || c === "," || c === "=") {
      tokens.push({ kind: "punct", value: c, num: 0, line });
      i++;
      continue;
    }
    if (c === '"') {
      let s = "";
      i++;
      let closed = false;
      while (i < n) {
        const d = src.charAt(i);
        if (d === "\\") {
          const e = src.charAt(i + 1);
          if (e === '"') s += '"';
          else if (e === "\\") s += "\\";
          else if (e === "n") s += "\n";
          else if (e === "t") s += "\t";
          else throw new DialectError(`invalid string escape "\\${e ?? ""}"`, line);
          i += 2;
          continue;
        }
        if (d === '"') { closed = true; i++; break; }
        if (d === "\n") break;
        s += d;
        i++;
      }
      if (!closed) throw new DialectError("unterminated string literal", line);
      tokens.push({ kind: "string", value: s, num: 0, line });
      continue;
    }
    if (c === "-" || DIGIT.test(c)) {
      let j = i + 1;
      while (j < n && (DIGIT.test(src.charAt(j)) || src.charAt(j) === ".")) j++;
      const text = src.slice(i, j);
      const num = Number(text);
      if (Number.isNaN(num)) throw new DialectError(`invalid number "${text}"`, line);
      tokens.push({ kind: "number", value: text, num, line });
      i = j;
      continue;
    }
    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_CHAR.test(src.charAt(j))) j++;
      const text = src.slice(i, j);
      tokens.push({ kind: KEYWORDS.has(text) ? "keyword" : "ident", value: text, num: 0, line });
      i = j;
      continue;
    }
    throw new DialectError(`unexpected character "${c}"`, line);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos++];
    if (!t) throw new DialectError("unexpected end of input", this.lastLine());
    return t;
  }
  private lastLine(): number {
    return this.tokens[this.tokens.length - 1]?.line ?? 1;
  }
  private isPunct(p: string): boolean {
    const t = this.peek();
    return t !== undefined && t.kind === "punct" && t.value === p;
  }
  private expectPunct(p: string): void {
    const t = this.next();
    if (t.kind !== "punct" || t.value !== p) {
      throw new DialectError(`expected "${p}" but found "${t.value}"`, t.line);
    }
  }
  private expectIdent(): Token {
    const t = this.next();
    if (t.kind !== "ident") throw new DialectError(`expected identifier but found "${t.value}"`, t.line);
    return t;
  }

  parseFile(): RawFile {
    const header = this.parseHeader();
    const features: RawFeature[] = [];
    while (this.peek()) features.push(this.parseFeature());
    return { header, features };
  }

  private parseHeader(): Record<string, string> {
    const kw = this.next();
    if (kw.value !== "spec") throw new DialectError(`expected "spec" header but found "${kw.value}"`, kw.line);
    const header: Record<string, string> = {};
    while (this.isHeaderKv()) {
      const key = this.expectIdent();
      this.expectPunct("=");
      const val = this.next();
      if (val.kind !== "ident" && val.kind !== "number" && val.kind !== "keyword") {
        throw new DialectError(`expected header value but found "${val.value}"`, val.line);
      }
      header[key.value] = val.value;
    }
    return header;
  }

  // A header entry is `ident = ...`; a feature is `ident ident = ...`. Disambiguate on the 2nd token.
  private isHeaderKv(): boolean {
    const a = this.tokens[this.pos];
    const b = this.tokens[this.pos + 1];
    return a?.kind === "ident" && b?.kind === "punct" && b?.value === "=";
  }

  private parseFeature(): RawFeature {
    const cap = this.expectIdent();
    const id = this.expectIdent();
    this.expectPunct("=");
    const node = this.parseNode();
    return { capability: cap.value, id: id.value, node, line: cap.line };
  }

  private parseNode(): RawNode {
    const type = this.expectIdent();
    const args: Literal[] = [];
    const children: RawNode[] = [];
    if (this.isPunct("(")) {
      this.expectPunct("(");
      if (!this.isPunct(")")) {
        args.push(this.parseLiteral());
        while (this.isPunct(",")) {
          this.expectPunct(",");
          args.push(this.parseLiteral());
        }
      }
      this.expectPunct(")");
    }
    if (this.isPunct("{")) {
      this.expectPunct("{");
      while (!this.isPunct("}")) {
        if (!this.peek()) throw new DialectError(`unterminated "{" block`, type.line);
        children.push(this.parseNode());
      }
      this.expectPunct("}");
    }
    return { type: type.value, args, children, line: type.line };
  }

  private parseLiteral(): Literal {
    const t = this.next();
    if (t.kind === "string") return t.value;
    if (t.kind === "number") return t.num;
    if (t.kind === "keyword") return t.value === "true" ? true : t.value === "false" ? false : null;
    throw new DialectError(
      `expected a literal (string, number, true, false, null) but found "${t.value}"`,
      t.line,
    );
  }
}

export function parseOpenuiRaw(src: string): RawFile {
  return new Parser(tokenize(src)).parseFile();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run packages/dialect/test/parse.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @boyscout/dialect typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
git add packages/dialect/package.json packages/dialect/tsconfig.json packages/dialect/src/parse.ts packages/dialect/test/parse.test.ts pnpm-lock.yaml
git commit -m "feat(dialect): .openui parser (tokenizer + recursive descent -> RawFile)"
```

---

## Task 3: `bind` + `parseOpenui` (raw → validated `SpecificationT`)

**Files:**
- Create: `packages/dialect/src/bind.ts`
- Create: `packages/dialect/src/index.ts`
- Create: `packages/dialect/test/mock-registry.ts`
- Test: `packages/dialect/test/parse.test.ts` (extend with a `parseOpenui` block) — or a new `bind.test.ts`; this plan uses a new `bind.test.ts`.

**Interfaces:**
- Consumes: `parseOpenuiRaw`, `RawFile`, `RawFeature`, `RawNode`, `Literal`, `DialectError` (Task 2); `validateSpec` from `@boyscout/spec`; `SpecificationT`, `FeatureT`, `AstNodeT` from `@boyscout/schemas`.
- Produces:
  - `interface DialectRegistry { capabilities: readonly string[]; nodeTypesFor(c: string): readonly string[]; paramsFor(t: string): readonly string[] }`
  - `function bind(file: RawFile, reg: DialectRegistry): SpecificationT`
  - `function parseOpenui(text: string, registry: DialectRegistry): SpecificationT` (throws on parse/bind/validate failure)

- [ ] **Step 1: Create the shared test mock registry**

`packages/dialect/test/mock-registry.ts`:
```ts
import type { DialectRegistry } from "../src/bind.js";

const NODE_TYPES: Record<string, readonly string[]> = {
  component: ["VStack", "HStack", "Card", "Grid", "Heading", "Text", "Button"],
  service: ["Service", "Method"],
  store: ["Store", "Action"],
  http: ["Http", "Endpoint"],
};

const PARAMS: Record<string, readonly string[]> = {
  VStack: ["gap"], HStack: ["gap"], Card: [], Grid: ["columns"],
  Heading: ["level", "text"], Text: ["type", "text"], Button: ["variant", "text"],
  Service: ["name"], Method: ["name", "params", "returns"],
  Store: ["name", "state"], Action: ["name", "payload"],
  Http: ["name"], Endpoint: ["name", "method", "path", "response"],
};

/** Mirrors the astryx bridge table; keeps the dialect package free of any bridge dependency in tests. */
export const mockRegistry: DialectRegistry = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (c) => NODE_TYPES[c] ?? [],
  paramsFor: (t) => PARAMS[t] ?? [],
};
```

- [ ] **Step 2: Write the failing test**

`packages/dialect/test/bind.test.ts`:
```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { parseOpenui } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const SRC = `spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
`;

const EXPECTED: SpecificationT = {
  version: "1",
  features: [
    {
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
              { type: "Text", props: { type: "body", text: "Member since 2026" } },
              { type: "Button", props: { variant: "primary", text: "Edit" } },
            ],
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

describe("parseOpenui", () => {
  it("binds positional args to named props and defaults workflow fields", () => {
    expect(parseOpenui(SRC, mockRegistry)).toEqual(EXPECTED);
  });

  it("rejects an unknown node type with a line number", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Bogus\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/unknown node type "Bogus".*line 3/s);
  });

  it("rejects more args than the node has params", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Card(1)\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/takes 0 argument/);
  });

  it("rejects an unknown capability", () => {
    const bad = `spec version=1 bridge=b platform=p\nwidget x =\n  Card\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/unknown capability "widget"/);
  });

  it("rejects a missing header field", () => {
    expect(() => parseOpenui(`spec version=1 bridge=b\ncomponent x =\n  Card\n`, mockRegistry)).toThrow(
      /missing "spec platform/,
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/dialect/test/bind.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 4: Implement `bind`**

`packages/dialect/src/bind.ts`:
```ts
import type { AstNodeT, FeatureT, SpecificationT } from "@boyscout/schemas";
import { DialectError, type Literal, type RawFeature, type RawFile, type RawNode } from "./parse.js";

export interface DialectRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];
  paramsFor(nodeType: string): readonly string[];
}

function bindNode(
  raw: RawNode,
  capability: string,
  allowed: ReadonlySet<string>,
  reg: DialectRegistry,
): AstNodeT {
  if (!allowed.has(raw.type)) {
    throw new DialectError(`unknown node type "${raw.type}" for capability "${capability}"`, raw.line);
  }
  const params = reg.paramsFor(raw.type);
  if (raw.args.length > params.length) {
    throw new DialectError(
      `"${raw.type}" takes ${params.length} argument(s) but got ${raw.args.length}`,
      raw.line,
    );
  }
  const node: AstNodeT = { type: raw.type };
  if (raw.args.length > 0) {
    const props: Record<string, Literal> = {};
    raw.args.forEach((v, idx) => {
      const key = params[idx]; // guarded: args.length <= params.length, so key is defined
      if (key !== undefined) props[key] = v;
    });
    node.props = props;
  }
  if (raw.children.length > 0) {
    node.children = raw.children.map((c) => bindNode(c, capability, allowed, reg));
  }
  return node;
}

function bindFeature(raw: RawFeature, reg: DialectRegistry): FeatureT {
  if (!reg.capabilities.includes(raw.capability)) {
    throw new DialectError(`unknown capability "${raw.capability}"`, raw.line);
  }
  const allowed = new Set(reg.nodeTypesFor(raw.capability));
  return {
    id: raw.id,
    capability: raw.capability,
    tree: bindNode(raw.node, raw.capability, allowed, reg),
    annotations: {},
    props: {},
    approved: true,
  };
}

export function bind(file: RawFile, reg: DialectRegistry): SpecificationT {
  const h = file.header;
  const version = h.version;
  const bridge = h.bridge;
  const platform = h.platform;
  if (version === undefined || bridge === undefined || platform === undefined) {
    const missing = version === undefined ? "version" : bridge === undefined ? "bridge" : "platform";
    throw new DialectError(`missing "spec ${missing}=..." in header`, 1);
  }
  return {
    version,
    features: file.features.map((f) => bindFeature(f, reg)),
    metadata: { bridge, platform, checksum: "" },
  };
}
```

- [ ] **Step 5: Implement the public API**

`packages/dialect/src/index.ts`:
```ts
import type { SpecificationT } from "@boyscout/schemas";
import { validateSpec } from "@boyscout/spec";
import { bind, type DialectRegistry } from "./bind.js";
import { parseOpenuiRaw } from "./parse.js";
import { serializeOpenui } from "./serialize.js";

export { DialectError } from "./parse.js";
export type { DialectRegistry } from "./bind.js";
export { serializeOpenui } from "./serialize.js";

/** `.openui` text -> bind -> validate (Zod + pre-barrier). Throws on any failure. */
export function parseOpenui(text: string, registry: DialectRegistry): SpecificationT {
  const spec = bind(parseOpenuiRaw(text), registry);
  const validated = validateSpec(spec, registry);
  if (!validated.ok) throw new Error(`invalid .openui spec: ${validated.violations.join("; ")}`);
  return validated.spec;
}
```

Note: `index.ts` imports `serialize.js`, created in Task 4. To keep Task 3 self-contained and testable, **create a minimal `serialize.ts` stub now** and flesh it out in Task 4:
`packages/dialect/src/serialize.ts` (stub):
```ts
import type { SpecificationT } from "@boyscout/schemas";
import type { DialectRegistry } from "./bind.js";

export function serializeOpenui(_spec: SpecificationT, _reg: DialectRegistry): string {
  throw new Error("serializeOpenui not implemented (Task 4)");
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run packages/dialect/test/bind.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @boyscout/dialect typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**
```bash
git add packages/dialect/src/bind.ts packages/dialect/src/index.ts packages/dialect/src/serialize.ts packages/dialect/test/mock-registry.ts packages/dialect/test/bind.test.ts
git commit -m "feat(dialect): bind + parseOpenui (positional->named, defaults, validateSpec gate)"
```

---

## Task 4: `serializeOpenui` + round-trip laws

**Files:**
- Modify: `packages/dialect/src/serialize.ts` (replace the stub)
- Test: `packages/dialect/test/roundtrip.test.ts`

**Interfaces:**
- Consumes: `SpecificationT`, `AstNodeT` (schemas); `DialectRegistry` (Task 3); `parseOpenui` (Task 3).
- Produces: `function serializeOpenui(spec: SpecificationT, reg: DialectRegistry): string` — canonical `.openui` text (2-space indent, LF, trailing newline). Throws on a prop absent from the node's param list, or a prop-value type it cannot serialize.

- [ ] **Step 1: Write the failing test**

`packages/dialect/test/roundtrip.test.ts`:
```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { parseOpenui, serializeOpenui } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const CANONICAL = `spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
`;

function feature(capability: string, id: string, tree: SpecificationT["features"][number]["tree"]) {
  return { id, capability, tree, annotations: {}, props: {}, approved: true };
}
function spec(f: SpecificationT["features"][number]): SpecificationT {
  return { version: "1", features: [f], metadata: { bridge: "astryx-react", platform: "react", checksum: "" } };
}

const CORPUS: SpecificationT[] = [
  spec(feature("component", "user-card", {
    type: "Card",
    children: [{
      type: "VStack", props: { gap: 2 },
      children: [
        { type: "Heading", props: { level: 3, text: "Profile" } },
        { type: "Text", props: { type: "body", text: "Member since 2026" } },
        { type: "Button", props: { variant: "primary", text: "Edit" } },
      ],
    }],
  })),
  spec(feature("service", "user-service", {
    type: "Service", props: { name: "UserService" },
    children: [{ type: "Method", props: { name: "getUsers", params: "", returns: "Promise<User[]>" } }],
  })),
  spec(feature("store", "cart", {
    type: "Store", props: { name: "Cart", state: "CartState" },
    children: [{ type: "Action", props: { name: "addItem", payload: "Item" } }],
  })),
  spec(feature("http", "users-api", {
    type: "Http", props: { name: "UsersApi" },
    children: [{ type: "Endpoint", props: { name: "list", method: "GET", path: "/users", response: "User[]" } }],
  })),
];

describe("serializeOpenui + round-trip laws", () => {
  it("serializes the user-card spec to the exact canonical form", () => {
    expect(serializeOpenui(CORPUS[0], mockRegistry)).toBe(CANONICAL);
  });

  for (const s of CORPUS) {
    const id = s.features[0].id;
    it(`law 2 (AST-lossless): ${id} -> serialize -> parse == spec`, () => {
      expect(parseOpenui(serializeOpenui(s, mockRegistry), mockRegistry)).toEqual(s);
    });
    it(`law 1+3 (canonical fixed point / convergence): ${id}`, () => {
      const text = serializeOpenui(s, mockRegistry);
      expect(serializeOpenui(parseOpenui(text, mockRegistry), mockRegistry)).toBe(text);
    });
  }

  it("law 3 (messy input converges to canonical in one pass)", () => {
    const messy = `spec   version=1   bridge=astryx-react  platform=react\ncomponent user-card =\nCard{VStack(2){Heading(3,"Profile") Text("body","Member since 2026") Button("primary","Edit")}}`;
    expect(serializeOpenui(parseOpenui(messy, mockRegistry), mockRegistry)).toBe(CANONICAL);
  });

  it("throws when a prop is not in the node's parameter list", () => {
    const bogus = spec(feature("component", "x", { type: "Card", props: { color: "red" } }));
    expect(() => serializeOpenui(bogus, mockRegistry)).toThrow(/not in its parameter list/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/dialect/test/roundtrip.test.ts`
Expected: FAIL — `serializeOpenui not implemented (Task 4)`.

- [ ] **Step 3: Implement the serializer**

Replace `packages/dialect/src/serialize.ts` entirely:
```ts
import type { AstNodeT, SpecificationT } from "@boyscout/schemas";
import type { DialectRegistry } from "./bind.js";

const INDENT = "  ";

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function literal(v: unknown): string {
  if (typeof v === "string") return `"${escapeString(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "null";
  throw new Error(`cannot serialize prop value of type ${typeof v}`);
}

function serializeNode(node: AstNodeT, depth: number, reg: DialectRegistry): string {
  const pad = INDENT.repeat(depth);
  const params = reg.paramsFor(node.type);
  const props = node.props ?? {};
  for (const k of Object.keys(props)) {
    if (!params.includes(k)) {
      throw new Error(
        `node "${node.type}" has prop "${k}" not in its parameter list [${params.join(", ")}]`,
      );
    }
  }
  // Positional args in param order, trimmed to the last present param (contiguous from index 0).
  let lastIdx = -1;
  params.forEach((p, i) => {
    if (p in props) lastIdx = i;
  });
  const args = params.slice(0, lastIdx + 1).map((p) => literal(props[p]));
  const argStr = args.length > 0 ? `(${args.join(", ")})` : "";

  const children = node.children ?? [];
  if (children.length === 0) return `${pad}${node.type}${argStr}`;
  const inner = children.map((c) => serializeNode(c, depth + 1, reg)).join("\n");
  return `${pad}${node.type}${argStr} {\n${inner}\n${pad}}`;
}

/** SpecificationT -> canonical .openui text (2-space indent, LF, trailing newline). Deterministic by construction. */
export function serializeOpenui(spec: SpecificationT, reg: DialectRegistry): string {
  const header = `spec version=${spec.version} bridge=${spec.metadata.bridge} platform=${spec.metadata.platform}`;
  const features = spec.features.map((f) => `${f.capability} ${f.id} =\n${serializeNode(f.tree, 1, reg)}`);
  return `${header}\n\n${features.join("\n\n")}\n`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/dialect/test/roundtrip.test.ts`
Expected: PASS (1 + 4×2 + 1 + 1 = 11 assertions across the `it`s).

- [ ] **Step 5: Typecheck + full dialect suite**

Run: `pnpm --filter @boyscout/dialect typecheck && npx vitest run packages/dialect`
Expected: no type errors; all dialect tests green.

- [ ] **Step 6: Commit**
```bash
git add packages/dialect/src/serialize.ts packages/dialect/test/roundtrip.test.ts
git commit -m "feat(dialect): serializeOpenui + byte-stable both-directions round-trip laws (D10)"
```

---

## Task 5: Prerequisite fixes — JSX escaping + zero-child guard

**Files:**
- Modify: `packages/bridges/bridge-astryx-react/src/provider.ts` (`renderAttrs`, `renderNode`)
- Modify: `packages/guardrails/src/index.ts` (`checkExpressible`)
- Test: `packages/bridges/bridge-astryx-react/test/escaping.test.ts`, `packages/guardrails/test/zero-child.test.ts`

**Interfaces:**
- Consumes: existing `componentProvider.generate` (provider.ts); `checkExpressible(spec, registry)` (guardrails).
- Produces: no signature changes. `renderAttrs`/`renderNode` escape untrusted strings; `checkExpressible` adds a violation for a zero-child `service`/`store`/`http` feature.

- [ ] **Step 1: Write the failing escaping test**

`packages/bridges/bridge-astryx-react/test/escaping.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/provider.js";

const feature = (tree: unknown) =>
  ({ id: "x", capability: "component", tree, annotations: {}, props: {}, approved: true }) as never;

describe("astryx component provider escaping", () => {
  it("escapes special characters in JSX text children", () => {
    const [asset] = componentProvider.generate(
      feature({ type: "Text", props: { type: "body", text: 'a "q" <b> {c} & d' } }),
    );
    expect(asset.content).toContain("a &quot;q&quot; &lt;b&gt; &#123;c&#125; &amp; d");
    expect(asset.content).not.toContain("<b>");
  });

  it("escapes special characters in attribute string values", () => {
    const [asset] = componentProvider.generate(
      feature({ type: "Text", props: { type: 'a"<&', text: "hi" } }),
    );
    expect(asset.content).toContain('type="a&quot;&lt;&amp;"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/escaping.test.ts`
Expected: FAIL — raw `<b>` / unescaped `"` present in output.

- [ ] **Step 3: Add escaping to the provider**

In `packages/bridges/bridge-astryx-react/src/provider.ts`, add two helpers above `renderAttrs`:
```ts
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}
```
In `renderAttrs`, change the string branch:
```ts
      return typeof v === "number" ? `${k}={${v}}` : `${k}="${escapeAttr(String(v))}"`;
```
In `renderNode`, change the text-child branch:
```ts
  if (TEXT_CHILD.has(node.type) && typeof props.text === "string") {
    inner = escapeText(props.text);
  } else if (node.children) {
```

- [ ] **Step 4: Run the escaping test to verify it passes**

Run: `npx vitest run packages/bridges/bridge-astryx-react/test/escaping.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing zero-child test**

`packages/guardrails/test/zero-child.test.ts`:
```ts
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { checkExpressible } from "../src/index.js";

const reg = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (c: string) =>
    ({ component: ["Card"], service: ["Service", "Method"], store: ["Store", "Action"], http: ["Http", "Endpoint"] })[c] ?? [],
};

const spec = (capability: string, tree: unknown): SpecificationT =>
  ({
    version: "1",
    features: [{ id: "f", capability, tree, annotations: {}, props: {}, approved: true }],
    metadata: { bridge: "b", platform: "p", checksum: "" },
  }) as SpecificationT;

describe("checkExpressible zero-child logic-bearing guard", () => {
  it("rejects a service with no Method children", () => {
    const r = checkExpressible(spec("service", { type: "Service", props: { name: "S" } }), reg);
    expect(r.ok).toBe(false);
    expect(r.violations.join()).toMatch(/no Method children/);
  });
  it("accepts a service with a Method child", () => {
    const r = checkExpressible(
      spec("service", { type: "Service", props: { name: "S" }, children: [{ type: "Method" }] }),
      reg,
    );
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run packages/guardrails/test/zero-child.test.ts`
Expected: FAIL — first case reports `ok: true`.

- [ ] **Step 7: Add the zero-child guard to `checkExpressible`**

In `packages/guardrails/src/index.ts`, add near the top (after `collectTypes`):
```ts
const CHILD_TYPE: Record<string, string> = { service: "Method", store: "Action", http: "Endpoint" };
```
Then inside `checkExpressible`, in the `for (const feature of spec.features)` loop, after the existing node-type check block (after the inner `for (const t of types)` loop), add:
```ts
    const childType = CHILD_TYPE[feature.capability];
    if (childType) {
      const tree = feature.tree as TreeNode;
      const count = (tree.children ?? []).filter((c) => c.type === childType).length;
      if (count === 0) {
        violations.push(`feature ${feature.id}: ${feature.capability} has no ${childType} children`);
      }
    }
```

- [ ] **Step 8: Run the zero-child test to verify it passes**

Run: `npx vitest run packages/guardrails/test/zero-child.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Typecheck + full suite (guard against golden drift)**

Run: `pnpm --filter @boyscout/bridge-astryx-react typecheck && pnpm --filter @boyscout/guardrails typecheck && pnpm test`
Expected: no type errors; **entire suite green** — existing `UserCard.tsx` and seam goldens are unaffected (their text/attrs contain no `&"<>{}`, so escaping is identity).

- [ ] **Step 10: Commit**
```bash
git add packages/bridges/bridge-astryx-react/src/provider.ts packages/bridges/bridge-astryx-react/test/escaping.test.ts packages/guardrails/src/index.ts packages/guardrails/test/zero-child.test.ts
git commit -m "fix(bridge,guardrails): escape untrusted JSX text/attrs; reject zero-child logic-bearing features (SP4a prereqs)"
```

---

## Task 6: E2E — author `.openui` → generate → byte-identical scaffolds

**Files:**
- Create: `apps/cli/test/fixtures/dialect.openui`
- Create: `apps/cli/test/fixtures/dialect-config.yaml`
- Create: `apps/cli/test/dialect-golden.test.ts`
- Create (via `UPDATE_GOLDENS=1`): `apps/cli/test/goldens/dialect/*.tsx`

**Interfaces:**
- Consumes: `parseOpenui`, `serializeOpenui` (`@boyscout/dialect`); `registry`, `bridge` (`@boyscout/bridge-astryx-react`); `buildAssets`, `loadConfig` (`@boyscout/runtime`); `writeBytes`, `hash` (`@boyscout/determinism`).
- Produces: proof that a real-registry `.openui` parses to a spec the engine generates byte-identically, that escaping yields the expected entities in generated JSX, and that the real astryx `paramsFor` table round-trips.

- [ ] **Step 1: Add the dialect package as an apps/cli devDependency**

In `apps/cli/package.json`, add to `dependencies` (alongside the existing bridge/runtime entries):
```json
    "@boyscout/dialect": "workspace:*",
```
Run: `pnpm install`
Expected: `@boyscout/dialect` linked into `apps/cli`.

- [ ] **Step 2: Create the fixtures**

`apps/cli/test/fixtures/dialect.openui`:
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

component escape-demo =
  Card {
    Text("body", "Tom \"TJ\" <j> {x} & co")
  }
```
`apps/cli/test/fixtures/dialect-config.yaml` (same shape as `seam-config.yaml`; only the `component` capability is used by this fixture):
```yaml
platform: react
bridge: astryx-react
capabilities:
  - component
```

- [ ] **Step 3: Write the E2E test**

`apps/cli/test/dialect-golden.test.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge, registry } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui, serializeOpenui } from "@boyscout/dialect";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const openuiText = readFileSync(here("./fixtures/dialect.openui"), "utf8");
const config = loadConfig(readFileSync(here("./fixtures/dialect-config.yaml"), "utf8"));

describe("SP4a E2E: authored .openui drives the engine", () => {
  it("parses to a spec that generates byte-identical scaffolds (escaping proven)", () => {
    const specInput = parseOpenui(openuiText, registry);
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);
    expect(scaffolds).toHaveLength(2); // user-card + escape-demo

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/dialect/${asset.path}`);
      const bytes = writeBytes(asset.content);
      if (UPDATE) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, bytes);
        continue;
      }
      expect(existsSync(goldenPath), `missing golden for ${asset.path}`).toBe(true);
      expect(hash(bytes), `byte drift in ${asset.path}`).toBe(hash(readFileSync(goldenPath)));
    }
  });

  it("escaped the untrusted text into valid JSX entities (no raw < or { in output)", () => {
    const specInput = parseOpenui(openuiText, registry);
    const assets = buildAssets({ specInput, config, bridge });
    const demo = assets.find((a) => a.path === "EscapeDemo.tsx");
    expect(demo).toBeDefined();
    expect(demo?.content).toContain("Tom &quot;TJ&quot; &lt;j&gt; &#123;x&#125; &amp; co");
  });

  it("round-trips through the REAL astryx registry (parse . serialize is a fixed point)", () => {
    const spec = parseOpenui(openuiText, registry);
    const text = serializeOpenui(spec, registry);
    expect(serializeOpenui(parseOpenui(text, registry), registry)).toBe(text);
    expect(parseOpenui(serializeOpenui(spec, registry), registry)).toEqual(spec);
  });
});
```

- [ ] **Step 4: Generate the goldens, then run the test read-only**

Run: `UPDATE_GOLDENS=1 npx vitest run apps/cli/test/dialect-golden.test.ts`
Then inspect `apps/cli/test/goldens/dialect/EscapeDemo.tsx` — confirm the text child reads `Tom &quot;TJ&quot; &lt;j&gt; &#123;x&#125; &amp; co` (no raw `<`, `{`, or `"`), then re-run read-only:
Run: `npx vitest run apps/cli/test/dialect-golden.test.ts`
Expected: PASS (3 tests) with goldens committed.

- [ ] **Step 5: Full suite + typecheck across the workspace**

Run: `pnpm test && pnpm -r typecheck`
Expected: entire suite green; all packages typecheck.

- [ ] **Step 6: Commit**
```bash
git add apps/cli/package.json apps/cli/test/fixtures/dialect.openui apps/cli/test/fixtures/dialect-config.yaml apps/cli/test/dialect-golden.test.ts apps/cli/test/goldens/dialect pnpm-lock.yaml
git commit -m "test(sp4a): E2E authored .openui -> generate byte-identical scaffolds + real-registry round-trip"
```

---

## Notes for the executor

- **Cross-OS golden CI:** the new `apps/cli/test/goldens/dialect/*` participate in the existing 3-OS matrix automatically (same harness as the seam goldens). No CI config change is needed; the matrix run is the cross-OS byte-identity proof for the dialect path.
- **`.gitignore`:** the dialect tests write no temp files (unlike the seam-compile test), so no `.gitignore` change is needed.
- **`serialize.ts` two-step:** Task 3 lands a throwing stub so `index.ts` compiles and `parseOpenui` is testable; Task 4 replaces the stub with the real implementation. Do not skip the stub — `index.ts` imports it.
- **Contiguity assumption in serialize:** positional emission trims trailing absent params but assumes present props are contiguous from index 0 (true for DSL-authored specs, where `Heading.level` etc. are always present). A hand-built spec with a positional gap throws loudly in `literal(undefined)` — acceptable and correct for SP4a.
```
