# SP1 — Foundations & Determinism Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the BoyScout monorepo and prove the determinism thesis's mechanical core — `@boyscout/determinism` primitives produce byte-identical output on Linux/macOS/Windows in CI — before any generation code exists.

**Architecture:** A pnpm monorepo with two agnostic, logic-free-except-primitives packages: `@boyscout/schemas` (Zod contracts + the abstract `CapabilityContract` interface) and `@boyscout/determinism` (the only sanctioned serialize/sort/hash/format/write path). A committed golden-file suite runs under a `{ubuntu, macos, windows} × node20` GitHub Actions matrix; the suite's core assertion is that the primitives' output matches the goldens byte-for-byte on all three OSes. Biome is used programmatically (WASM, in-memory config) as the hermetic formatter *and* as the CLI lint/format tool.

**Tech Stack:** pnpm workspaces · TypeScript 5.9 (strict) · Zod 4 · Vitest 4 · Biome 2.5 (CLI + `@biomejs/js-api` WASM) · GitHub Actions.

## Global Constraints

- **Node runtime (CI):** node20 across the full `{ubuntu, macos, windows}` matrix. Local dev may use newer, but nothing may depend on APIs absent from node20.
- **Exact version pins (no `^`/`~` ranges — determinism depends on exact bytes):** `typescript@5.9.3`, `zod@4.4.3`, `vitest@4.1.10`, `@biomejs/biome@2.5.3`, `@biomejs/js-api@6.0.0`, `@biomejs/wasm-nodejs@2.5.3`, `@types/node@20.19.9`. Committed `pnpm-lock.yaml` is the transitive pin.
- **Byte discipline:** all string ordering goes through `byteCompare` (UTF-8 byte order) — **never** `localeCompare` or default `Array.sort`. All file content goes through `writeBytes` (LF-only, UTF-8, no BOM, single final newline).
- **Determinism boundary:** every serialize/sort/hash/format/write in the whole product routes through `@boyscout/determinism`. No `JSON.stringify` for persisted output outside `canonicalJson`; no direct Biome CLI call for programmatic formatting outside `format`.
- **Agnosticism:** `@boyscout/schemas` contains **zero** per-capability concrete input schemas — those are bridge-owned (D1, §8, §14.3). `props`/`inputs` stay generic.
- **Hermetic Biome:** the `format` primitive applies an explicit in-memory config and never discovers an ambient `biome.json`.
- **TDD:** every primitive gets its failing test first. Commit after each green task.

---

## File Structure

```
package.json                      # workspace root; scripts: build, typecheck, test, format, lint, golden:update
pnpm-workspace.yaml               # packages/*
tsconfig.base.json                # strict
biome.json                        # CLI lint+format config (pinned, explicit)
vitest.config.ts                  # workspace test config
.github/workflows/ci.yml          # {ubuntu,macos,windows} x node20 -> typecheck + test (golden proof)
.gitattributes                    # * text eol=lf  (stops git normalizing goldens on Windows)
packages/
  determinism/
    package.json
    tsconfig.json
    src/
      byte-order.ts               # byteCompare, sortByBytes
      canonical-json.ts           # canonicalJson
      hash.ts                     # hash
      write-bytes.ts              # writeBytes
      format.ts                   # format (hermetic Biome WASM wrapper)
      index.ts                    # barrel
    goldens/                      # committed expected bytes
      canonical-json.json
      write-bytes.txt
      format-ts.txt
    test/
      byte-order.test.ts
      canonical-json.test.ts
      hash.test.ts
      write-bytes.test.ts
      format.test.ts
      golden.test.ts              # cross-OS byte-identity assertions
  schemas/
    package.json
    tsconfig.json
    src/
      index.ts                    # all Zod schemas + CapabilityContract interface + inferred types
    test/
      schemas.test.ts             # sample specs validate / malformed reject
      capability-contract.test-d.ts  # type-level: declarative + logic-bearing samples typecheck
```

---

### Task 1: Monorepo scaffold & green toolchain

Stand up the workspace so `pnpm typecheck`, `pnpm test`, and `pnpm lint` all run green on an empty repo. Everything downstream builds on this.

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.gitattributes`, `.gitignore`
- Create: `packages/determinism/package.json`, `packages/determinism/tsconfig.json`, `packages/determinism/src/index.ts`
- Create: `packages/schemas/package.json`, `packages/schemas/tsconfig.json`, `packages/schemas/src/index.ts`

**Interfaces:**
- Produces: workspace scripts `pnpm typecheck` (runs `tsc --noEmit` per package), `pnpm test` (vitest), `pnpm lint` / `pnpm format` (Biome CLI), `pnpm golden:update` (sets `UPDATE_GOLDENS=1`). Package names `@boyscout/determinism`, `@boyscout/schemas`.

- [ ] **Step 1: Root `package.json`**

```json
{
  "name": "boyscout",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.32.1",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "pnpm -r --parallel typecheck",
    "test": "vitest run",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "golden:update": "UPDATE_GOLDENS=1 vitest run golden"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.3",
    "@types/node": "20.19.9",
    "typescript": "5.9.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: `tsconfig.base.json`** (strict, node20 target)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 4: `biome.json`** (CLI config; explicit, pinned behavior)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.3/schema.json",
  "files": { "includes": ["**", "!**/goldens/**"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "linter": { "enabled": true, "rules": { "recommended": true } }
}
```

- [ ] **Step 5: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
```

- [ ] **Step 6: `.gitattributes`** (critical — stops git from rewriting golden line endings on Windows checkout)

```
* text=auto eol=lf
*.png binary
*.wasm binary
```

- [ ] **Step 7: `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 8: determinism package manifest + tsconfig + empty barrel**

`packages/determinism/package.json`:
```json
{
  "name": "@boyscout/determinism",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": {
    "@biomejs/js-api": "6.0.0",
    "@biomejs/wasm-nodejs": "2.5.3"
  }
}
```

`packages/determinism/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/determinism/src/index.ts`:
```ts
export {};
```

- [ ] **Step 9: schemas package manifest + tsconfig + empty barrel**

`packages/schemas/package.json`:
```json
{
  "name": "@boyscout/schemas",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p tsconfig.json" },
  "dependencies": { "zod": "4.4.3" }
}
```

`packages/schemas/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

`packages/schemas/src/index.ts`:
```ts
export {};
```

- [ ] **Step 10: Install and verify the toolchain is green**

Run:
```bash
pnpm install
pnpm typecheck
pnpm test
pnpm format:check
```
Expected: install writes `pnpm-lock.yaml`; `typecheck` passes (no files to check errors is fine); `test` reports "No test files found" (exit 0 with `vitest run` when no tests — acceptable at this step); `format:check` passes. If `vitest run` exits non-zero on zero tests, add `"passWithNoTests": true` under `test` in `vitest.config.ts`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo, strict TS, Biome, Vitest (SP1)"
```

---

### Task 2: `byteCompare` / `sortByBytes` — UTF-8 byte ordering

The single ordering primitive. UTF-8 byte order equals Unicode code-point order and is the true serialization order; UTF-16 code-unit order (`localeCompare`, default sort) is **not** and would drift on astral characters.

**Files:**
- Create: `packages/determinism/src/byte-order.ts`
- Test: `packages/determinism/test/byte-order.test.ts`
- Modify: `packages/determinism/src/index.ts`

**Interfaces:**
- Produces: `byteCompare(a: string, b: string): -1 | 0 | 1`, `sortByBytes<T>(items: readonly T[], keyFn: (t: T) => string): T[]` (returns a new array; stable).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { byteCompare, sortByBytes } from "../src/byte-order.js";

describe("byteCompare", () => {
  it("orders ascii by byte", () => {
    expect(byteCompare("a", "b")).toBe(-1);
    expect(byteCompare("b", "a")).toBe(1);
    expect(byteCompare("a", "a")).toBe(0);
  });
  it("treats a prefix as smaller", () => {
    expect(byteCompare("ab", "abc")).toBe(-1);
    expect(byteCompare("abc", "ab")).toBe(1);
  });
  it("orders by UTF-8 bytes, not UTF-16 units (astral vs BMP)", () => {
    // U+FE4F (﹏, 3 UTF-8 bytes, lead 0xEF) sorts before U+1F600 (😀, 4 bytes, lead 0xF0)
    expect(byteCompare("﹏", "\u{1F600}")).toBe(-1);
    // localeCompare / default sort would disagree via surrogate code units
  });
  it("is not localeCompare (case/diacritic independent, pure bytes)", () => {
    // 'Z' (0x5A) < 'a' (0x61) by byte; locale would often put 'a' first
    expect(byteCompare("Z", "a")).toBe(-1);
  });
});

describe("sortByBytes", () => {
  it("sorts keys by byte order and does not mutate input", () => {
    const input = [{ k: "b" }, { k: "a" }, { k: "Z" }];
    const out = sortByBytes(input, (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(["Z", "a", "b"]);
    expect(input.map((x) => x.k)).toEqual(["b", "a", "Z"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/byte-order.test.ts`
Expected: FAIL — cannot resolve `../src/byte-order.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/determinism/src/byte-order.ts`:
```ts
const encoder = new TextEncoder();

/** Compare two strings by their UTF-8 byte sequence (== Unicode code-point order). Never locale-aware. */
export function byteCompare(a: string, b: string): -1 | 0 | 1 {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  const n = Math.min(ba.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = ba[i]!;
    const y = bb[i]!;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (ba.length === bb.length) return 0;
  return ba.length < bb.length ? -1 : 1;
}

/** Stable sort of a copy of `items` by `byteCompare` of each item's string key. */
export function sortByBytes<T>(items: readonly T[], keyFn: (t: T) => string): T[] {
  return [...items].sort((x, y) => byteCompare(keyFn(x), keyFn(y)));
}
```

- [ ] **Step 4: Export from the barrel**

`packages/determinism/src/index.ts`:
```ts
export { byteCompare, sortByBytes } from "./byte-order.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/byte-order.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/determinism/src/byte-order.ts packages/determinism/src/index.ts packages/determinism/test/byte-order.test.ts
git commit -m "feat(determinism): byteCompare + sortByBytes (UTF-8 byte ordering)"
```

---

### Task 3: `canonicalJson` — the core determinism primitive

Byte-sorted object keys, spec-defined number formatting, explicit null/undefined policy, zero whitespace ambiguity. This is the product's thesis; it is hand-rolled and golden-tested rather than delegated to a dependency.

**Files:**
- Create: `packages/determinism/src/canonical-json.ts`
- Test: `packages/determinism/test/canonical-json.test.ts`
- Modify: `packages/determinism/src/index.ts`

**Interfaces:**
- Consumes: `byteCompare` from `./byte-order.js`.
- Produces: `canonicalJson(value: unknown): string`. Policy: object keys sorted by `byteCompare`; object properties whose value is `undefined` are omitted; `undefined` as an array element throws; `bigint`, `function`, `symbol`, and non-finite numbers throw; `-0` serializes as `0`; strings/numbers use `JSON.stringify` per-value (ECMAScript-defined, engine-stable).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical-json.js";

describe("canonicalJson", () => {
  it("sorts object keys by byte order", () => {
    expect(canonicalJson({ b: 1, a: 2, Z: 3 })).toBe('{"Z":3,"a":2,"b":1}');
  });
  it("sorts nested keys recursively and emits no whitespace", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 }, a: [3, { z: 1, y: 2 }] })).toBe(
      '{"a":[3,{"y":2,"z":1}],"x":{"c":2,"d":1}}',
    );
  });
  it("treats numeric-like keys as byte-sorted strings", () => {
    expect(canonicalJson({ 10: "a", 2: "b", 1: "c" })).toBe('{"1":"c","10":"a","2":"b"}');
  });
  it("omits undefined object properties", () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });
  it("normalizes -0 to 0", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson({ n: -0 })).toBe('{"n":0}');
  });
  it("serializes null, booleans, and strings", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson("a\"b")).toBe('"a\\"b"');
  });
  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson(NaN)).toThrow();
    expect(() => canonicalJson(Infinity)).toThrow();
  });
  it("rejects undefined array elements and unsupported types", () => {
    expect(() => canonicalJson([undefined])).toThrow();
    expect(() => canonicalJson(10n)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/canonical-json.test.ts`
Expected: FAIL — cannot resolve `../src/canonical-json.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/determinism/src/canonical-json.ts`:
```ts
import { byteCompare } from "./byte-order.js";

/** Deterministic JSON: byte-sorted keys, no whitespace, explicit type policy. */
export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return "null";

  const t = typeof v;
  if (t === "string") return JSON.stringify(v);
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(v)) throw new Error(`canonicalJson: non-finite number (${String(v)})`);
    return JSON.stringify(v === 0 ? 0 : v); // collapse -0 -> 0
  }
  if (t === "bigint") throw new Error("canonicalJson: bigint is not serializable");

  if (Array.isArray(v)) {
    const parts = v.map((el) => {
      if (el === undefined) throw new Error("canonicalJson: undefined array element");
      return serialize(el);
    });
    return `[${parts.join(",")}]`;
  }

  if (t === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort(byteCompare);
    const parts = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`);
    return `{${parts.join(",")}}`;
  }

  throw new Error(`canonicalJson: unsupported type (${t})`);
}
```

- [ ] **Step 4: Export from the barrel**

`packages/determinism/src/index.ts` — add:
```ts
export { canonicalJson } from "./canonical-json.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/canonical-json.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add packages/determinism/src/canonical-json.ts packages/determinism/src/index.ts packages/determinism/test/canonical-json.test.ts
git commit -m "feat(determinism): canonicalJson (byte-sorted, hand-rolled, typed policy)"
```

---

### Task 4: `hash` — SHA-256 over canonical bytes

**Files:**
- Create: `packages/determinism/src/hash.ts`
- Test: `packages/determinism/test/hash.test.ts`
- Modify: `packages/determinism/src/index.ts`

**Interfaces:**
- Produces: `hash(bytes: Uint8Array): string` — lowercase hex SHA-256, via `node:crypto`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { hash } from "../src/hash.js";

describe("hash", () => {
  it("is SHA-256 hex of the input bytes (known vector for empty input)", () => {
    expect(hash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it('matches the known vector for "abc"', () => {
    expect(hash(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("is stable across calls", () => {
    const b = new TextEncoder().encode("boyscout");
    expect(hash(b)).toBe(hash(b));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/hash.test.ts`
Expected: FAIL — cannot resolve `../src/hash.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/determinism/src/hash.ts`:
```ts
import { createHash } from "node:crypto";

/** Lowercase hex SHA-256 over the given bytes. */
export function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
```

- [ ] **Step 4: Export from the barrel**

`packages/determinism/src/index.ts` — add:
```ts
export { hash } from "./hash.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/hash.test.ts`
Expected: PASS (known vectors match).

- [ ] **Step 6: Commit**

```bash
git add packages/determinism/src/hash.ts packages/determinism/src/index.ts packages/determinism/test/hash.test.ts
git commit -m "feat(determinism): hash (SHA-256 hex over bytes)"
```

---

### Task 5: `writeBytes` — LF / UTF-8 / no-BOM / final newline

**Files:**
- Create: `packages/determinism/src/write-bytes.ts`
- Test: `packages/determinism/test/write-bytes.test.ts`
- Modify: `packages/determinism/src/index.ts`

**Interfaces:**
- Produces: `writeBytes(content: string): Uint8Array` — CRLF/CR normalized to LF, a leading U+FEFF BOM stripped, a single trailing LF ensured, encoded UTF-8.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { writeBytes } from "../src/write-bytes.js";

const dec = new TextDecoder();

describe("writeBytes", () => {
  it("normalizes CRLF and CR to LF", () => {
    expect(dec.decode(writeBytes("a\r\nb\rc"))).toBe("a\nb\nc\n");
  });
  it("ensures exactly one trailing newline", () => {
    expect(dec.decode(writeBytes("x"))).toBe("x\n");
    expect(dec.decode(writeBytes("x\n"))).toBe("x\n");
  });
  it("strips a leading UTF-8 BOM and never emits one", () => {
    const out = writeBytes("﻿hello");
    expect(out[0]).not.toBe(0xef); // no BOM bytes at start
    expect(dec.decode(out)).toBe("hello\n");
  });
  it("encodes UTF-8", () => {
    expect(Array.from(writeBytes("é"))).toEqual([0xc3, 0xa9, 0x0a]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/write-bytes.test.ts`
Expected: FAIL — cannot resolve `../src/write-bytes.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/determinism/src/write-bytes.ts`:
```ts
const encoder = new TextEncoder();

/** Canonical file bytes: LF-only, UTF-8, no BOM, exactly one trailing newline. */
export function writeBytes(content: string): Uint8Array {
  const noBom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lf = noBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const withFinalNewline = lf.endsWith("\n") ? lf : `${lf}\n`;
  return encoder.encode(withFinalNewline);
}
```

- [ ] **Step 4: Export from the barrel**

`packages/determinism/src/index.ts` — add:
```ts
export { writeBytes } from "./write-bytes.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/write-bytes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/determinism/src/write-bytes.ts packages/determinism/src/index.ts packages/determinism/test/write-bytes.test.ts
git commit -m "feat(determinism): writeBytes (LF/UTF-8/no-BOM/final newline)"
```

---

### Task 6: `format` — hermetic Biome (WASM, in-memory config)

The determinism long-pole. Biome runs as a WASM module (byte-identical across OSes — no native per-OS binary), with an explicit in-memory config and **no** ambient `biome.json` discovery. The instance and project key are created once and cached.

**Files:**
- Create: `packages/determinism/src/format.ts`
- Test: `packages/determinism/test/format.test.ts`
- Modify: `packages/determinism/src/index.ts`

**Interfaces:**
- Produces: `type FormatLang = "ts" | "tsx" | "js" | "json" | "css"`, `format(source: string, lang: FormatLang): string`.

> **Pin note:** written against `@biomejs/js-api@6.0.0` + `@biomejs/wasm-nodejs@2.5.3` (subpath import `@biomejs/js-api/nodejs`, `new Biome()`, `openProject`, `applyConfiguration`, `formatContent`). If a re-pin changes the constructor/method shape, adapt the calls — the *pin* and the *explicit in-memory config* are the determinism contract, not the exact call syntax. HTML formatting is intentionally out of scope for SP1 (Biome HTML is experimental); TS is the representative long-pole.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { format } from "../src/format.js";

describe("format", () => {
  it("formats messy TS to the pinned canonical style", () => {
    const out = format("const  x=1 ;function  f( a,b ){return a==b}", "ts");
    expect(out).toContain("const x = 1;");
    expect(out).toContain("function f(a, b)");
  });
  it("is idempotent: format(format(x)) === format(x)", () => {
    const once = format("const x=1", "ts");
    expect(format(once, "ts")).toBe(once);
  });
  it("formats JSON", () => {
    expect(format('{"b":1,"a":2}', "json")).toContain('"b": 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/format.test.ts`
Expected: FAIL — cannot resolve `../src/format.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/determinism/src/format.ts`:
```ts
import { Biome } from "@biomejs/js-api/nodejs";

export type FormatLang = "ts" | "tsx" | "js" | "json" | "css";

const VIRTUAL_PATH: Record<FormatLang, string> = {
  ts: "file.ts",
  tsx: "file.tsx",
  js: "file.js",
  json: "file.json",
  css: "file.css",
};

// Explicit in-memory config — the hermetic contract. No ambient biome.json is ever read.
const CONFIG = {
  formatter: {
    enabled: true,
    indentStyle: "space",
    indentWidth: 2,
    lineWidth: 100,
    lineEnding: "lf",
  },
  javascript: {
    formatter: { quoteStyle: "double", semicolons: "always", trailingCommas: "all" },
  },
  json: { formatter: { enabled: true } },
  css: { formatter: { enabled: true } },
} as const;

let cached: { biome: Biome; projectKey: string } | null = null;

function instance(): { biome: Biome; projectKey: string } {
  if (cached) return cached;
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  biome.applyConfiguration(projectKey, CONFIG as never);
  cached = { biome, projectKey };
  return cached;
}

/** Format source with a pinned, hermetic Biome instance. */
export function format(source: string, lang: FormatLang): string {
  const { biome, projectKey } = instance();
  const { content } = biome.formatContent(projectKey, source, { filePath: VIRTUAL_PATH[lang] });
  return content;
}
```

- [ ] **Step 4: Export from the barrel**

`packages/determinism/src/index.ts` — add:
```ts
export { format, type FormatLang } from "./format.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/format.test.ts`
Expected: PASS. If the WASM peer fails to load, confirm `@biomejs/wasm-nodejs@2.5.3` is installed in `packages/determinism`. If `openProject("/")` errors on a path, use `openProject(".")` — the config still comes from `applyConfiguration`, not the filesystem.

- [ ] **Step 6: Commit**

```bash
git add packages/determinism/src/format.ts packages/determinism/src/index.ts packages/determinism/test/format.test.ts
git commit -m "feat(determinism): format (hermetic Biome WASM, in-memory config)"
```

---

### Task 7: `@boyscout/schemas` — contracts & `CapabilityContract` interface

Zod 4 runtime schemas for the spec/config/graph shapes, plus the abstract generic `CapabilityContract<In, Out>` interface every Registry entry satisfies. **No** per-capability concrete input schemas — those are bridge-owned.

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/schemas/test/schemas.test.ts`
- Test: `packages/schemas/test/capability-contract.test-d.ts`

**Interfaces:**
- Produces (runtime Zod schemas + inferred types): `Specification`, `Feature`, `AstNode`, `BoyscoutConfig`, `ExecutionGraph`, `SeamContract`, `Event`, `GuardrailResult`. Produces (type only): `interface CapabilityContract<In, Out>`.

- [ ] **Step 1: Write the failing runtime test**

`packages/schemas/test/schemas.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BoyscoutConfig, GuardrailResult, Specification } from "../src/index.js";

const sampleSpec = {
  version: "1",
  features: [
    {
      id: "hero",
      capability: "component",
      tree: { type: "Box", children: [{ type: "Text" }] },
      annotations: {},
      props: {},
      approved: true,
    },
  ],
  metadata: { bridge: "astryx-react", platform: "web", checksum: "abc" },
};

describe("Specification", () => {
  it("accepts a well-formed spec", () => {
    expect(Specification.parse(sampleSpec).features[0]!.id).toBe("hero");
  });
  it("rejects a spec missing metadata", () => {
    const bad = { ...sampleSpec, metadata: undefined };
    expect(Specification.safeParse(bad).success).toBe(false);
  });
  it("rejects a feature missing an id", () => {
    const bad = structuredClone(sampleSpec);
    // @ts-expect-error intentional malformation
    delete bad.features[0].id;
    expect(Specification.safeParse(bad).success).toBe(false);
  });
});

describe("BoyscoutConfig", () => {
  it("accepts a minimal config", () => {
    const cfg = { platform: "web", bridge: "astryx-react", capabilities: ["component"] };
    expect(BoyscoutConfig.parse(cfg).bridge).toBe("astryx-react");
  });
});

describe("GuardrailResult", () => {
  it("accepts a passing result", () => {
    expect(GuardrailResult.parse({ ok: true, violations: [], code: 200 }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/schemas/test/schemas.test.ts`
Expected: FAIL — `Specification` / `BoyscoutConfig` / `GuardrailResult` not exported.

- [ ] **Step 3: Write the schemas**

`packages/schemas/src/index.ts`:
```ts
import { z } from "zod";

/** OpenUI-lang AST node ("one AST", §17.1). Recursive; props stay generic (bridge-owned). */
export interface AstNodeT {
  type: string;
  props?: Record<string, unknown>;
  children?: AstNodeT[];
}
export const AstNode: z.ZodType<AstNodeT> = z.lazy(() =>
  z.object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(AstNode).optional(),
  }),
);

export const Feature = z.object({
  id: z.string(),
  capability: z.string(),
  tree: AstNode,
  annotations: z.record(z.string(), z.unknown()).default({}),
  props: z.record(z.string(), z.unknown()).default({}),
  approved: z.boolean(),
});
export type FeatureT = z.infer<typeof Feature>;

export const Specification = z.object({
  version: z.string(),
  features: z.array(Feature),
  metadata: z.object({
    bridge: z.string(),
    platform: z.string(),
    checksum: z.string(),
  }),
});
export type SpecificationT = z.infer<typeof Specification>;

export const BoyscoutConfig = z.object({
  platform: z.string(),
  bridge: z.string(),
  capabilities: z.array(z.string()),
  bridges: z.record(z.string(), z.unknown()).default({}),
  guardrails: z.record(z.string(), z.unknown()).default({}),
  templates: z.record(z.string(), z.unknown()).default({}),
});
export type BoyscoutConfigT = z.infer<typeof BoyscoutConfig>;

export const ExecutionGraph = z.object({
  nodes: z.array(z.object({ id: z.string(), capability: z.string() })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
  ordering: z.array(z.string()),
});
export type ExecutionGraphT = z.infer<typeof ExecutionGraph>;

/** Durable scaffold <-> human-logic seam (D2d). */
export const SeamContract = z.object({
  srcPath: z.string(),
  typedSignature: z.string(),
  binding: z.string(),
});
export type SeamContractT = z.infer<typeof SeamContract>;

export const Event = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type EventT = z.infer<typeof Event>;

export const GuardrailResult = z.object({
  ok: z.boolean(),
  violations: z.array(z.string()),
  code: z.number(),
});
export type GuardrailResultT = z.infer<typeof GuardrailResult>;

/**
 * Abstract contract every Registry entry satisfies. Generic over the concrete
 * input/output shapes, which are authored per-Bridge (Astryx SP2, Material SP6) —
 * NOT here (§8/§14.3). This interface is the shared shape; the props are not.
 */
export interface CapabilityContract<In = unknown, Out = unknown> {
  id: string;
  version: string;
  tier: "declarative" | "logic-bearing";
  inputs: In;
  outputs: Out;
  validators: string[];
  constraints: Record<string, unknown>;
  seam?: SeamContractT;
  metadata: Record<string, unknown>;
}
```

- [ ] **Step 4: Run runtime test to verify it passes**

Run: `pnpm vitest run packages/schemas/test/schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the type-level test (declarative + logic-bearing samples typecheck)**

`packages/schemas/test/capability-contract.test-d.ts`:
```ts
import type { CapabilityContract } from "../src/index.js";

// Declarative sample: a bridge-authored concrete input shape plugs into the generic slot.
type ComponentInput = { tag: string; props: Record<string, unknown> };
const declarative: CapabilityContract<ComponentInput, { file: string }> = {
  id: "component",
  version: "1",
  tier: "declarative",
  inputs: { tag: "Box", props: {} },
  outputs: { file: "Box.tsx" },
  validators: ["ast-shape"],
  constraints: {},
  metadata: {},
};

// Logic-bearing sample: carries a seam contract.
type ServiceInput = { name: string; methods: string[] };
const logicBearing: CapabilityContract<ServiceInput, { scaffold: string }> = {
  id: "service",
  version: "1",
  tier: "logic-bearing",
  inputs: { name: "Api", methods: ["get"] },
  outputs: { scaffold: "Api.running.ts" },
  validators: ["seam-signature"],
  constraints: {},
  seam: { srcPath: "src/Api.ts", typedSignature: "get(): Promise<unknown>", binding: "Api" },
  metadata: {},
};

// Reference the values so they are not elided.
void declarative;
void logicBearing;
```

- [ ] **Step 6: Run typecheck to verify both samples compile**

Run: `pnpm --filter @boyscout/schemas typecheck`
Expected: PASS (no type errors). This proves the interface typechecks against a declarative *and* a logic-bearing contract (done-criterion).

- [ ] **Step 7: Commit**

```bash
git add packages/schemas/src/index.ts packages/schemas/test/schemas.test.ts packages/schemas/test/capability-contract.test-d.ts
git commit -m "feat(schemas): spec/config/graph contracts + CapabilityContract interface"
```

---

### Task 8: Golden harness + cross-OS CI matrix (the reason SP1 exists)

Commit expected-byte goldens for `canonicalJson`, `writeBytes`, and `format`, and assert them under a `{ubuntu, macos, windows} × node20` matrix. The matrix run **is** the cross-OS byte-identity proof (D3b).

**Files:**
- Create: `packages/determinism/goldens/canonical-json.json`, `packages/determinism/goldens/write-bytes.txt`, `packages/determinism/goldens/format-ts.txt`
- Create: `packages/determinism/test/golden.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `canonicalJson`, `writeBytes`, `format`, `hash` from `@boyscout/determinism`.
- Golden update mechanism: running with `UPDATE_GOLDENS=1` rewrites the golden files; otherwise the test asserts byte-equality against them.

- [ ] **Step 1: Write the golden test (bootstrap + assert)**

`packages/determinism/test/golden.test.ts`:
```ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, format, hash, writeBytes } from "../src/index.js";

const UPDATE = process.env.UPDATE_GOLDENS === "1";
const goldenPath = (name: string) =>
  fileURLToPath(new URL(`../goldens/${name}`, import.meta.url));

/** Assert `actual` bytes equal the committed golden; with UPDATE_GOLDENS=1, (re)write it. */
function assertGolden(name: string, actual: Uint8Array): void {
  const path = goldenPath(name);
  if (UPDATE) {
    writeFileSync(path, actual);
    return;
  }
  const expected = new Uint8Array(readFileSync(path));
  // Compare via hash so a mismatch failure message stays small and OS-independent.
  expect(hash(actual)).toBe(hash(expected));
}

const CANONICAL_FIXTURE = {
  z: 1,
  a: { d: [3, 2, 1], c: "café" },
  "10": true,
  "2": null,
  unicode: "😀﹏",
};

const TS_FIXTURE = "const  x=1 ;function  f( a,b ){return a==b}\n";

describe("golden (cross-OS byte identity)", () => {
  it("canonicalJson golden", () => {
    assertGolden("canonical-json.json", writeBytes(canonicalJson(CANONICAL_FIXTURE)));
  });
  it("writeBytes golden (CRLF input normalized)", () => {
    assertGolden("write-bytes.txt", writeBytes("line1\r\nline2\rline3"));
  });
  it("format golden (TS)", () => {
    assertGolden("format-ts.txt", writeBytes(format(TS_FIXTURE, "ts")));
  });
});
```

- [ ] **Step 2: Generate the goldens locally, then inspect them**

Run:
```bash
pnpm golden:update
git status --short packages/determinism/goldens/
```
Expected: the three golden files appear as new/modified. Open each and sanity-check: `canonical-json.json` must show byte-sorted keys (`"10"` before `"2"` before `"a"` before `"unicode"` before `"z"`) and end with a single `\n`; `format-ts.txt` must show the pinned formatted TS.

- [ ] **Step 3: Verify the goldens now pass in assert mode**

Run: `pnpm vitest run packages/determinism/test/golden.test.ts`
Expected: PASS (no `UPDATE_GOLDENS`, so it asserts against the committed bytes).

- [ ] **Step 4: Prove drift is caught (temporary sanity check)**

Manually append a space to `packages/determinism/goldens/write-bytes.txt`, then run:
`pnpm vitest run packages/determinism/test/golden.test.ts`
Expected: FAIL on the writeBytes golden (hash mismatch). Then restore: `git checkout packages/determinism/goldens/write-bytes.txt`. This confirms the harness actually fails on drift — do not commit the tampered file.

- [ ] **Step 5: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm format:check
      - run: pnpm lint
```

- [ ] **Step 6: Run the full local gate exactly as CI will**

Run:
```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm format:check && pnpm lint
```
Expected: all green. This is the same sequence each OS runs; the golden test inside `pnpm test` is what proves byte-identity once the matrix executes.

- [ ] **Step 7: Commit**

```bash
git add packages/determinism/goldens .github/workflows/ci.yml packages/determinism/test/golden.test.ts
git commit -m "feat(determinism): golden harness + cross-OS CI matrix (D3b proof)"
```

- [ ] **Step 8: Push and confirm the matrix is green on all three OSes**

```bash
git push
```
Then check the `ci` workflow: `ubuntu-latest`, `macos-latest`, and `windows-latest` must all pass. **Green on all three = the SP1 done-criterion (cross-OS byte identity) is met.** If Windows alone fails on a golden, the cause is almost certainly line-ending normalization — verify `.gitattributes` shipped in Task 1 and that the goldens were committed with LF.

---

## Self-Review

**Spec coverage (design doc → task):**
- `@boyscout/schemas` (Specification/Feature/AstNode/BoyscoutConfig/ExecutionGraph/CapabilityContract/SeamContract/Event/GuardrailResult) → Task 7. ✓
- `@boyscout/determinism` (canonicalJson/sortByBytes+byteCompare/hash/format/writeBytes) → Tasks 2–6. ✓
- Golden harness + `{ubuntu,macos,windows}×node20` CI → Task 8. ✓
- Stack (pnpm, strict TS, Zod 4, Vitest, pinned Biome as format+lint) → Task 1. ✓
- Testing (primitive units, schema units, type-level contract check, cross-OS golden) → Tasks 2–8. ✓
- "Not in SP1" (per-capability concrete input schemas, runtime/planner/codegen/seam mechanism, authoring) → excluded; only the generic `CapabilityContract` interface and abstract `SeamContract` shape are defined, per the boundary in the design. ✓

**Placeholder scan:** No TBD/TODO; every code step carries complete code; every run step states the expected result. ✓

**Type consistency:** `byteCompare`/`sortByBytes` (Task 2) consumed by `canonicalJson` (Task 3) and golden test (Task 8); `SeamContractT` (Task 7) referenced by `CapabilityContract.seam` (same file); `FormatLang` (Task 6) used by golden test (Task 8); `hash`/`writeBytes`/`format`/`canonicalJson` barrel exports consumed consistently in Task 8. Package names `@boyscout/determinism` / `@boyscout/schemas` consistent throughout. ✓

**Known adaptation point:** the exact `@biomejs/js-api` call shape (Task 6) is pinned but flagged — if the pinned package's constructor differs, the implementer adapts the calls; the pin + explicit in-memory config is the invariant, not the syntax.
