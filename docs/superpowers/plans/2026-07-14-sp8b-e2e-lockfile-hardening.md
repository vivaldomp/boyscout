# SP8b — Full E2E, Lockfile & Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close SP8's four remaining pillars — full E2E chain green in CI, `boyscout.lock` transitive-closure lockfile with drift verification, a matured cross-OS golden, and the §21 hardening checklist gate (plus the SP8a `composeSkill` escaping carry-in).

**Architecture:** Wire the existing (mature but unrun) Playwright specs into an Ubuntu-only CI job; add a pure `@boyscout/lockfile` package that builds/serializes/diffs a generation closure, wired into `generate` with a `--check` gate; capture the seed-derived scaffold as a cross-OS golden; harden `composeSkill` interpolation; author a security-checklist audit doc.

**Tech Stack:** pnpm workspaces, ESM (no build step for packages), TypeScript (strict), vitest, Playwright, Biome, `@boyscout/determinism` primitives.

## Global Constraints

- **Determinism:** all serialize/sort/format/write goes through `@boyscout/determinism` (`canonicalJson`, `sortByBytes`, `writeBytes`, `hash`). Never hand-roll JSON/sorting/line-endings.
- **Runtime-agnosticism invariant (carried from SP8a):** the Runtime never reads `bridge.skill`. The new `bridge.version` is read by `@boyscout/lockfile` (generation-domain), not by the Runtime engine — no invariant conflict.
- **Strict TS:** `import type` / inline `type`; `.js` relative specifiers on `.ts` source; conditional-spread for optional props (never `k: undefined`); guards/casts for index access (`noUncheckedIndexedAccess`).
- **Packages export `./src/index.ts` directly — no build step.** (The `boyscout-ui` `dist/` the E2E needs is the Vite UI bundle produced by `pnpm --filter boyscout-ui build`, not a package build.)
- **Format before commit:** run `node_modules/.bin/biome format packages apps` before every commit — SP7's CI failed on format-check drift when only `lint` ran locally. Verify with `pnpm format:check`.
- **E2E is Ubuntu-only in CI;** cross-OS byte-identity stays proven by the golden `pnpm test` matrix (all 3 OSes).
- **Lockfile granularity:** the `BridgeRegistry` exposes capabilities as strings + providers — it does **not** surface `CapabilityContract` instances, so per-capability `version`/`tier` are not resolvable at generate time. The bridge is the versioned unit (§23); the closure pins `bridge.version` + the capability **names** the spec used. This is a deliberate, honest narrowing of the spec's "per-CapabilityContract" wording.

---

### Task 1: `Bridge.version` contract field

**Files:**
- Modify: `packages/schemas/src/index.ts` (add `version` to `Bridge` interface, after `platform`)
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts` (populate `version`)
- Modify: `packages/bridges/bridge-material/src/index.ts` (populate `version`)
- Test: `packages/bridges/bridge-astryx-react/test/version.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `Bridge.version: string` (read by Task 2's `buildLockClosure`). Astryx bridge `version` = `"0.1.0"`; Material bridge `version` = `"0.1.0"`.

- [ ] **Step 1: Write the failing test**

`packages/bridges/bridge-astryx-react/test/version.test.ts`:

```ts
import { bridge } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";

describe("bridge-astryx-react version", () => {
  it("exposes a non-empty semver-ish version string", () => {
    expect(bridge.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/version.test.ts`
Expected: FAIL — `bridge.version` is `undefined` (property does not exist / type error).

- [ ] **Step 3: Add the field to the contract**

In `packages/schemas/src/index.ts`, the `Bridge` interface — add `version` right after `platform`:

```ts
export interface Bridge {
  readonly id: string;
  readonly platform: string;
  /** Bridge version — the pinned unit for lockfile closures (SP8b). */
  readonly version: string;
  readonly registry: BridgeRegistry;
  readonly postRules: readonly AssetRule[];
  /** Optional Bridge Skill fragment (SP8a). Consumed only by skill-template. */
  readonly skill?: BridgeSkill;
}
```

- [ ] **Step 4: Populate both bridges**

`packages/bridges/bridge-astryx-react/src/index.ts` — in the `export const bridge: Bridge = {` object, add after `platform: "react",`:

```ts
  version: "0.1.0",
```

`packages/bridges/bridge-material/src/index.ts` — in the `export const bridge: Bridge = {` object, add after `platform: "angular",`:

```ts
  version: "0.1.0",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/version.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck (catches any test-constructed Bridge missing `version`)**

Run: `pnpm -r typecheck`
Expected: PASS. If a test elsewhere constructs a `Bridge` literal, add `version: "0.0.0"` to it.

- [ ] **Step 7: Format and commit**

```bash
node_modules/.bin/biome format --write packages
git add packages/schemas/src/index.ts packages/bridges/bridge-astryx-react packages/bridges/bridge-material
git commit -m "feat(sp8b): add version field to Bridge contract"
```

---

### Task 2: `@boyscout/lockfile` package (pure closure builder)

**Files:**
- Create: `packages/lockfile/package.json`
- Create: `packages/lockfile/tsconfig.json`
- Create: `packages/lockfile/src/index.ts`
- Test: `packages/lockfile/test/closure.test.ts`

**Interfaces:**
- Consumes: `Bridge` (with `version`, Task 1), `SpecificationT` (`@boyscout/schemas`); `canonicalJson`, `sortByBytes`, `writeBytes` (`@boyscout/determinism`).
- Produces:
  - `interface LockClosure { readonly runtimeVersion: string; readonly bridge: { readonly id: string; readonly version: string }; readonly capabilities: readonly string[]; readonly checksum: string; }`
  - `buildLockClosure(input: { spec: SpecificationT; bridge: Bridge; runtimeVersion: string }): LockClosure`
  - `serializeLock(closure: LockClosure): string`
  - `parseLock(text: string): LockClosure`
  - `diffLock(expected: LockClosure, actual: LockClosure): string[]` (`[]` = identical; direction `expected -> actual`)

- [ ] **Step 1: Scaffold the package**

`packages/lockfile/package.json`:

```json
{
  "name": "@boyscout/lockfile",
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
    "@boyscout/schemas": "workspace:*"
  },
  "devDependencies": {
    "@boyscout/bridge-astryx-react": "workspace:*"
  }
}
```

`packages/lockfile/tsconfig.json` (copy the exact contents of `packages/skill-template/tsconfig.json`):

```bash
cp packages/skill-template/tsconfig.json packages/lockfile/tsconfig.json
```

- [ ] **Step 2: Install so the workspace resolves the new package**

Run: `pnpm install`
Expected: adds `@boyscout/lockfile` to the workspace; no errors.

- [ ] **Step 3: Write the failing tests**

`packages/lockfile/test/closure.test.ts`:

```ts
import { bridge } from "@boyscout/bridge-astryx-react";
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "../src/index.js";

const spec: SpecificationT = {
  version: "1",
  features: [
    { id: "b", capability: "store", tree: { type: "root", children: [] }, annotations: {}, props: {}, approved: true },
    { id: "a", capability: "component", tree: { type: "root", children: [] }, annotations: {}, props: {}, approved: true },
    { id: "c", capability: "component", tree: { type: "root", children: [] }, annotations: {}, props: {}, approved: true },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "deadbeef" },
};

describe("buildLockClosure", () => {
  it("pins runtime, bridge id+version, sorted-unique capabilities, and checksum", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    expect(c).toEqual({
      runtimeVersion: "0.0.0",
      bridge: { id: "astryx-react", version: "0.1.0" },
      capabilities: ["component", "store"], // sorted by bytes, de-duped
      checksum: "deadbeef",
    });
  });

  it("is order-independent: shuffled features -> identical serialization", () => {
    const rev: SpecificationT = { ...spec, features: [...spec.features].reverse() };
    expect(serializeLock(buildLockClosure({ spec: rev, bridge, runtimeVersion: "0.0.0" }))).toBe(
      serializeLock(buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" })),
    );
  });
});

describe("serializeLock / parseLock", () => {
  it("is byte-stable and round-trips", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    const s = serializeLock(c);
    expect(s.endsWith("\n")).toBe(true); // canonical single trailing newline
    expect(serializeLock(c)).toBe(s); // stable across runs
    expect(parseLock(s)).toEqual(c);
  });
});

describe("diffLock", () => {
  it("returns [] for identical closures", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    expect(diffLock(c, c)).toEqual([]);
  });

  it("names each drifted field (expected -> actual)", () => {
    const a = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    const b = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.1" });
    expect(diffLock(a, b)).toEqual(["runtimeVersion: 0.0.0 -> 0.0.1"]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm exec vitest run packages/lockfile/test/closure.test.ts`
Expected: FAIL — `../src/index.js` has no exports yet.

- [ ] **Step 5: Implement the composer**

`packages/lockfile/src/index.ts`:

```ts
import { canonicalJson, sortByBytes, writeBytes } from "@boyscout/determinism";
import type { Bridge, SpecificationT } from "@boyscout/schemas";

/** The transitive closure that produced a generation — the reproducibility pin (D3b). */
export interface LockClosure {
  readonly runtimeVersion: string;
  readonly bridge: { readonly id: string; readonly version: string };
  /** Capability names the spec's features used, sorted by bytes, de-duplicated. */
  readonly capabilities: readonly string[];
  readonly checksum: string;
}

/**
 * Build the closure from the validated spec + resolved bridge. Only what the
 * generation touched — capability names the spec uses, not the whole registry.
 * Bridge-version granularity: the registry does not surface per-capability
 * contracts, and the bridge is the versioned unit (§23).
 */
export function buildLockClosure(input: {
  spec: SpecificationT;
  bridge: Bridge;
  runtimeVersion: string;
}): LockClosure {
  const unique = [...new Set(input.spec.features.map((f) => f.capability))];
  return {
    runtimeVersion: input.runtimeVersion,
    bridge: { id: input.bridge.id, version: input.bridge.version },
    capabilities: sortByBytes(unique, (c) => c),
    checksum: input.spec.metadata.checksum,
  };
}

/** Canonical, byte-stable serialization (canonicalJson -> writeBytes). */
export function serializeLock(closure: LockClosure): string {
  return new TextDecoder().decode(writeBytes(canonicalJson(closure)));
}

/** Parse a serialized lock back to a closure (structural; no validation beyond JSON). */
export function parseLock(text: string): LockClosure {
  return JSON.parse(text) as LockClosure;
}

/** Human-readable drift lines; [] = identical. Direction: expected -> actual. */
export function diffLock(expected: LockClosure, actual: LockClosure): string[] {
  if (serializeLock(expected) === serializeLock(actual)) return [];
  const lines: string[] = [];
  const cmp = (label: string, a: string, b: string) => {
    if (a !== b) lines.push(`${label}: ${a} -> ${b}`);
  };
  cmp("runtimeVersion", expected.runtimeVersion, actual.runtimeVersion);
  cmp("bridge.id", expected.bridge.id, actual.bridge.id);
  cmp("bridge.version", expected.bridge.version, actual.bridge.version);
  cmp("checksum", expected.checksum, actual.checksum);
  cmp("capabilities", expected.capabilities.join(","), actual.capabilities.join(","));
  return lines;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/lockfile/test/closure.test.ts`
Expected: PASS (all 6).

- [ ] **Step 7: Typecheck, format, commit**

```bash
pnpm --filter @boyscout/lockfile typecheck
node_modules/.bin/biome format --write packages
git add packages/lockfile pnpm-lock.yaml
git commit -m "feat(sp8b): add @boyscout/lockfile closure builder"
```

---

### Task 3: Wire lockfile into `generate` + `--check` drift gate

**Files:**
- Modify: `packages/runtime/package.json` (expose `./package.json` so the CLI can read the runtime version)
- Modify: `apps/cli/src/main.ts` (write `boyscout.lock`; `--check` verifies)
- Modify: `apps/cli/package.json` (add `@boyscout/lockfile` dependency)
- Test: `apps/cli/test/lockfile.test.ts` (new)

**Interfaces:**
- Consumes: `buildLockClosure`, `serializeLock`, `parseLock`, `diffLock` (Task 2); `Specification` (zod) from `@boyscout/schemas`.
- Produces: `boyscout.lock` at `dirname(specPath)`; `generate --check` exit code (0 = match, 1 = drift with diff on stderr).

- [ ] **Step 1: Write the failing test**

`apps/cli/test/lockfile.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

// Reuse the existing committed astryx spec+config fixtures (proven to generate by main.test.ts).
const specFixture = readFileSync(new URL("./fixtures/spec.json", import.meta.url), "utf8");
const configFixture = readFileSync(new URL("./fixtures/config.yaml", import.meta.url), "utf8");

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "bs-lock-"));
  writeFileSync(join(dir, "spec.json"), specFixture);
  writeFileSync(join(dir, "config.yaml"), configFixture);
  return dir;
}

describe("generate writes and verifies boyscout.lock", () => {
  it("writes boyscout.lock on generate", () => {
    const dir = project();
    const code = main(["generate", "--spec", join(dir, "spec.json"), "--config", join(dir, "config.yaml")]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, "boyscout.lock"))).toBe(true);
  });

  it("--check passes against a fresh lock", () => {
    const dir = project();
    const args = ["generate", "--spec", join(dir, "spec.json"), "--config", join(dir, "config.yaml")];
    expect(main(args)).toBe(0);
    expect(main([...args, "--check"])).toBe(0);
  });

  it("--check fails (exit 1) when the lock has drifted", () => {
    const dir = project();
    const args = ["generate", "--spec", join(dir, "spec.json"), "--config", join(dir, "config.yaml")];
    expect(main(args)).toBe(0);
    // Corrupt the on-disk lock to simulate drift.
    const lockPath = join(dir, "boyscout.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.bridge.version = "9.9.9";
    writeFileSync(lockPath, `${JSON.stringify(lock)}\n`);
    expect(main([...args, "--check"])).toBe(1);
  });
});
```

> Note: `apps/cli/test/fixtures/spec.json` and `config.yaml` already exist (astryx-react; `main.test.ts` proves they generate). Task 3 has no dependency on the seed-derived fixture — that one belongs to Task 6.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run apps/cli/test/lockfile.test.ts`
Expected: FAIL — no `boyscout.lock` written; `--check` unimplemented.

- [ ] **Step 3: Expose the runtime version**

In `packages/runtime/package.json`, add `./package.json` to `exports` so the CLI can read the version without exports-map blocking:

```json
  "exports": {
    ".": "./src/index.ts",
    "./package.json": "./package.json"
  }
```

(Merge with whatever `exports` already lists — keep the existing `"."` entry.)

- [ ] **Step 4: Add the dependency**

In `apps/cli/package.json` `dependencies`, add:

```json
    "@boyscout/lockfile": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 5: Implement write + `--check` in `main.ts`**

In `apps/cli/src/main.ts`:

Add imports at the top (alongside the existing ones):

```ts
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "@boyscout/lockfile";
import { Specification } from "@boyscout/schemas";
```

(Extend the existing `node:fs` import to include `writeFileSync`, and `node:path` to include `join`, rather than duplicating.)

Add a module-level runtime-version resolver:

```ts
const runtimeVersion = (
  createRequire(import.meta.url)("@boyscout/runtime/package.json") as { version: string }
).version;
```

In `main`, after `const configPath = ...`, add the check flag:

```ts
  const check = argv.includes("--check");
```

Then, inside the `try` block, after the successful `generate({...})` call and the `emitted`/`preserved` loops, before `return 0;`:

```ts
    const spec = Specification.parse(specInput);
    const closure = buildLockClosure({ spec, bridge, runtimeVersion });
    const lockPath = join(dirname(specPath), "boyscout.lock");
    if (check) {
      const drift = diffLock(parseLock(readFileSync(lockPath, "utf8")), closure);
      if (drift.length > 0) {
        process.stderr.write(`boyscout.lock drift:\n${drift.map((d) => `  - ${d}`).join("\n")}\n`);
        return 1;
      }
    } else {
      writeFileSync(lockPath, serializeLock(closure));
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run apps/cli/test/lockfile.test.ts`
Expected: PASS (all 3).

- [ ] **Step 7: Full CLI suite + typecheck + format + commit**

```bash
pnpm exec vitest run apps/cli
pnpm -r typecheck
node_modules/.bin/biome format --write apps packages
git add apps/cli packages/runtime/package.json pnpm-lock.yaml
git commit -m "feat(sp8b): write boyscout.lock on generate; --check drift gate"
```

---

### Task 4: `composeSkill` escaping (SP8a carry-in)

**Files:**
- Modify: `packages/skill-template/src/index.ts`
- Test: `packages/skill-template/test/escaping.test.ts` (new)

**Interfaces:**
- Consumes: existing `composeSkill(bridges, meta)`.
- Produces: no signature change — hardened output only.

- [ ] **Step 1: Write the failing test**

`packages/skill-template/test/escaping.test.ts`:

```ts
import type { Bridge } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

const frag = { conventions: "c", imports: "i", tokens: "t", architecture: "a", naming: "n" };
const mk = (id: string): Bridge =>
  ({ id, platform: "p", version: "0.0.0", registry: {} as never, postRules: [], skill: frag });

describe("composeSkill escaping", () => {
  it("YAML-escapes newline/quote in meta so frontmatter stays single-key", () => {
    const md = composeSkill([mk("x")], { name: 'a"\nname: injected', description: "d" });
    const front = md.slice(0, md.indexOf("\n---"));
    // exactly one top-level `name:` line inside the frontmatter block
    expect(front.match(/^name:/gm)?.length).toBe(1);
    expect(front).not.toContain("\nname: injected");
  });

  it("strips newline/heading chars from bridge id headings", () => {
    const md = composeSkill([mk("x\n## Injected")], { name: "n", description: "d" });
    expect(md).not.toContain("\n## Injected");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/skill-template/test/escaping.test.ts`
Expected: FAIL — raw interpolation lets the injected `name:` / heading through.

- [ ] **Step 3: Add escaping helpers and apply them**

In `packages/skill-template/src/index.ts`, add two helpers above `composeSkill`:

```ts
/** Minimal YAML double-quoted scalar — safe for frontmatter values. */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, "\\n")}"`;
}

/** Bridge ids are constrained identifiers; strip anything that could break out of a heading. */
function safeHeadingId(id: string): string {
  return id.replace(/[\r\n]/g, "").replace(/#/g, "");
}
```

Change the frontmatter line to use `yamlString`:

```ts
  const blocks: string[] = [
    `---\nname: ${yamlString(meta.name)}\ndescription: ${yamlString(meta.description)}\n---`,
  ];
```

Change the sub-block heading to use `safeHeadingId`:

```ts
      if (text) subs.push(`### ${safeHeadingId(b.id)}\n${text}`);
```

- [ ] **Step 4: Run the new + existing skill-template tests**

Run: `pnpm exec vitest run packages/skill-template`
Expected: PASS — escaping tests pass; the SP8a compose/real-bridges tests still pass (real ids/meta have no special chars, so their output is unchanged).

- [ ] **Step 5: Format and commit**

```bash
node_modules/.bin/biome format --write packages
git add packages/skill-template
git commit -m "fix(sp8b): escape meta and bridge id in composeSkill (SP8a carry-in)"
```

---

### Task 5: E2E wiring — Playwright config + Ubuntu-only CI job (debug-to-green)

**Files:**
- Create: `apps/boyscout-ui/playwright.config.ts`
- Create: `apps/cli/test/fixtures/astryx-seed-spec.json` (captured once; shared with Task 3)
- Modify: `.github/workflows/ci.yml` (new `e2e` job)
- Modify (only if the first run surfaces drift): `apps/boyscout-ui/e2e/*.spec.ts`, `apps/boyscout-ui/src/*`, `apps/cli/src/author/*`

**Interfaces:**
- Consumes: existing `apps/boyscout-ui/e2e/{authoring,guided}.spec.ts`, `e2e/fixtures/seed.openui`.
- Produces: `pnpm --filter boyscout-ui e2e` green; the `astryx-seed-spec.json` fixture.

- [ ] **Step 1: Create the Playwright config**

`apps/boyscout-ui/playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

// The specs spawn the daemon themselves in beforeAll (no webServer block).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
```

- [ ] **Step 2: Build the UI, install the browser, run the specs locally**

```bash
pnpm --filter boyscout-ui build
pnpm --filter boyscout-ui exec playwright install --with-deps chromium
pnpm --filter boyscout-ui e2e
```

Expected: both specs (`authoring.spec.ts`, `guided.spec.ts`) pass.

- [ ] **Step 3: Debug-to-green (only if Step 2 shows failures)**

The specs are mature but have never run against the current UI/daemon. Likely drift points, each fixed at its root:
- **Test-ids:** the specs use `preview`, `approve-user-card`, `commit`, `message`. If the UI renders different `data-testid`s, align the spec to the current UI (or add the missing `data-testid` — prefer whichever is the smaller, root-cause change).
- **Auth/env:** `BOYSCOUT_AUTH_TOKEN` override lives at `apps/cli/src/author/command.ts:34`; `/api/parse` and `Bearer`/`Origin` headers must match `apps/cli/src/author/app.ts`.
- **tsx loader path:** `apps/cli/node_modules/tsx/dist/loader.mjs` must exist (tsx is an `apps/cli` dep).
Fix until both specs pass locally. Do **not** weaken assertions to force green — fix the real drift.

- [ ] **Step 4: Capture the seed-derived spec as a shared fixture**

Once the authoring E2E passes, it has written a canonical `boyscout-spec.json` in its tmp `projectDir`. Capture that exact file (or re-derive it in-process via `createAuthApp` parse→approve→commit on `e2e/fixtures/seed.openui`) as:

```
apps/cli/test/fixtures/astryx-seed-spec.json
```

Verify it generates cleanly before committing:

```bash
node --import apps/cli/node_modules/tsx/dist/loader.mjs apps/cli/src/bin.ts generate \
  --spec apps/cli/test/fixtures/astryx-seed-spec.json \
  --config apps/cli/test/fixtures/dialect-config.yaml
```

Expected: exit 0, scaffolds printed. (This fixture is consumed by Task 6's golden test.)

- [ ] **Step 5: Add the Ubuntu-only `e2e` CI job**

In `.github/workflows/ci.yml`, add a second job under `jobs:` (sibling of `test`):

```yaml
  e2e:
    runs-on: ubuntu-latest
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
      - run: pnpm --filter boyscout-ui build
      - run: pnpm --filter boyscout-ui exec playwright install --with-deps chromium
      - run: pnpm --filter boyscout-ui e2e
```

- [ ] **Step 6: Commit**

```bash
node_modules/.bin/biome format --write apps
git add apps/boyscout-ui/playwright.config.ts apps/cli/test/fixtures/astryx-seed-spec.json .github/workflows/ci.yml apps/boyscout-ui/e2e apps/boyscout-ui/src apps/cli/src
git commit -m "feat(sp8b): wire E2E into CI (ubuntu-only) + seed spec fixture"
```

---

### Task 6: Matured cross-OS golden (seed-derived astryx scaffolds)

**Files:**
- Create: `apps/cli/test/e2e-seed-golden.test.ts`
- Create: `apps/cli/test/goldens/astryx-seed/**` (captured via `UPDATE_GOLDENS=1`)

**Interfaces:**
- Consumes: `apps/cli/test/fixtures/astryx-seed-spec.json` (Task 5), `dialect-config.yaml`; `buildAssets`, `loadConfig` (`@boyscout/runtime`); `hash`, `writeBytes` (`@boyscout/determinism`); `bridge` (`@boyscout/bridge-astryx-react`).
- Produces: byte-checked goldens for the E2E seed output, asserted in the `pnpm test` matrix (all 3 OSes).

- [ ] **Step 1: Write the golden test (mirrors the material golden)**

`apps/cli/test/e2e-seed-golden.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: E2E seed astryx scaffolds are byte-identical", () => {
  it("every .running scaffold matches its committed golden; durables excluded", () => {
    const config = loadConfig(readFileSync(here("./fixtures/dialect-config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/astryx-seed-spec.json"), "utf8"));
    const scaffolds = buildAssets({ specInput, config, bridge }).filter((a) => !a.durable);

    expect(scaffolds.length).toBeGreaterThan(0);
    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/astryx-seed/${asset.path}`);
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

- [ ] **Step 2: Capture the goldens**

Run: `UPDATE_GOLDENS=1 pnpm exec vitest run apps/cli/test/e2e-seed-golden.test.ts`
Expected: PASS; writes files under `apps/cli/test/goldens/astryx-seed/`.

- [ ] **Step 3: Re-run without UPDATE to verify the assertion holds**

Run: `pnpm exec vitest run apps/cli/test/e2e-seed-golden.test.ts`
Expected: PASS against the committed goldens.

- [ ] **Step 4: Commit**

```bash
node_modules/.bin/biome format --write apps
git add apps/cli/test/e2e-seed-golden.test.ts apps/cli/test/goldens/astryx-seed
git commit -m "test(sp8b): matured cross-OS golden for E2E seed scaffolds"
```

---

### Task 7: §21 hardening checklist gate

**Files:**
- Create: `docs/security-checklist.md`
- Test: `apps/cli/test/security-token.test.ts` (new — only the one control lacking a direct test)

**Interfaces:**
- Consumes: existing security tests in `apps/cli/test/author-app.test.ts` (Origin/token) and `author-commit.test.ts` (path shielding); token source at `apps/cli/src/author/command.ts:34`.
- Produces: the checklist doc + one CSPRNG-token test.

- [ ] **Step 1: Write the CSPRNG-token test**

The token is `randomBytes(24).toString("hex")` (`command.ts:34`), overridable via `BOYSCOUT_AUTH_TOKEN` for E2E only. Assert the default (no env) is a 48-char lowercase-hex string — proving it is derived from a 24-byte CSPRNG draw, not a constant/weak source.

`apps/cli/test/security-token.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultAuthToken } from "../src/author/command.js";

describe("§21 CSPRNG session token", () => {
  it("default token is 48 lowercase-hex chars (randomBytes(24))", () => {
    const a = defaultAuthToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(defaultAuthToken()).not.toBe(a); // fresh entropy each call
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run apps/cli/test/security-token.test.ts`
Expected: FAIL — `defaultAuthToken` is not exported yet.

- [ ] **Step 3: Extract the token factory so it is testable**

In `apps/cli/src/author/command.ts`, replace the inline token expression with a small exported factory and use it. Current (line ~34):

```ts
  const token = process.env.BOYSCOUT_AUTH_TOKEN ?? randomBytes(24).toString("hex");
```

Add near the top of the file:

```ts
/** §21: CSPRNG session token (24 bytes -> 48 hex). Never uses the generation "no OS randomness" path. */
export function defaultAuthToken(): string {
  return randomBytes(24).toString("hex");
}
```

And change the assignment to:

```ts
  const token = process.env.BOYSCOUT_AUTH_TOKEN ?? defaultAuthToken();
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run apps/cli/test/security-token.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the checklist doc**

`docs/security-checklist.md`:

```markdown
# §21 Security & Integrity — Checklist Gate

Each FIRST-SPEC §21 control maps to the test that proves it. All must pass before ship.

| Control (§21) | Implementation | Proving test |
|---|---|---|
| CSPRNG session token (24-byte draw; never the generation no-OS-randomness path) | `apps/cli/src/author/command.ts` `defaultAuthToken()` | `apps/cli/test/security-token.test.ts` |
| Bearer session token required | `apps/cli/src/author/app.ts` (`Authorization: Bearer`) | `author-app.test.ts` — "rejects /api without a token (401)", "rejects a wrong token (401)" |
| Origin enforcement | `apps/cli/src/author/app.ts` | `author-app.test.ts` — "rejects a foreign Origin (403)", "allows a valid token with matching Origin" |
| Path shielding against `..` | `apps/cli/src/author/commit.ts` | `author-commit.test.ts` (traversal rejection) |
| Loopback-default bind (`127.0.0.1`; `0.0.0.0` only under explicit config) | `apps/cli/src/author/command.ts` | `author-app.test.ts` / `author-guided.test.ts` (bind default) |

Run the gate: `pnpm exec vitest run apps/cli`.
```

> Before committing, open each referenced test and confirm the named case exists. If a control's test is missing (not just differently named), add the one test that proves that control, then update the row. Do **not** leave a row pointing at a non-existent test.

- [ ] **Step 6: Run the full CLI suite, format, commit**

```bash
pnpm exec vitest run apps/cli
node_modules/.bin/biome format --write apps
git add apps/cli/src/author/command.ts apps/cli/test/security-token.test.ts docs/security-checklist.md
git commit -m "test(sp8b): §21 hardening checklist + CSPRNG token test"
```

---

## Final verification (before finishing the branch)

- [ ] `pnpm -r typecheck` — all projects clean.
- [ ] `pnpm test` — full suite green (includes both goldens on the local OS; CI runs all 3).
- [ ] `pnpm format:check` && `pnpm lint` — clean.
- [ ] `pnpm --filter boyscout-ui e2e` — both specs green locally.
- [ ] Confirm the invariant still holds: `grep -rn "\.skill" packages/runtime/src` returns nothing; `bridge.version` is read only by `@boyscout/lockfile`.
