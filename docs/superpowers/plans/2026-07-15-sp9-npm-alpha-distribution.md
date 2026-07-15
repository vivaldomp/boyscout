# SP9 — npm Alpha Distribution & Public Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the first public `@boyscout/cli` alpha to npm — a single bundled package released by a tag-triggered GitHub Action using OIDC trusted publishing — fronted by a README, an MIT LICENSE, and a CONTRIBUTING that documents the spec+plan traceability chain.

**Architecture:** `apps/cli` becomes the only publishable package. esbuild bundles the CLI plus its `@boyscout/*` dependency closure into `dist/bin.js` while every third-party dependency stays external and pinned; `boyscout-ui`'s Vite output ships as `dist/ui`. A new create-if-absent `boyscout init` scaffolds config, seed spec, and the Claude Code `SKILL.md`, making SP8a's `composeSkill()` reachable by users. Pushing a `v*` tag gates, builds, publishes under the `alpha` dist-tag, and cuts a GitHub Release.

**Tech Stack:** pnpm workspaces, ESM, TypeScript (strict), vitest, esbuild 0.28.1, Biome, GitHub Actions, npm trusted publishing (OIDC).

**Spec:** `docs/superpowers/specs/2026-07-15-npm-alpha-distribution-design.md` (decisions **E1–E7**)

## Global Constraints

- **Determinism (D3a):** all serialize/sort/format/write goes through `@boyscout/determinism` — `canonicalJson(value: unknown): string`, `writeBytes(content: string): Uint8Array`, `sortByBytes`, `hash`. Never hand-roll JSON/sorting/line-endings. `writeBytes` strips BOM, normalizes CRLF→LF, and guarantees exactly one trailing newline; `canonicalJson` does **not** append one.
- **Strict TS:** `import type` / inline `type`; `.js` relative specifiers on `.ts` source; conditional-spread for optional props (never `k: undefined`); guards/casts for index access (`noUncheckedIndexedAccess`).
- **Packages export `./src/index.ts` directly — no build step.** SP9 adds a build to **`apps/cli` only** (E1). The other 15 packages stay `private: true` at `0.0.0` and are never published.
- **Bundle rule (E3):** bundle `@boyscout/*` only; **every** third-party dependency is external and **pinned exactly** (no `^`/`~`). `@biomejs/wasm-nodejs` is a WASM artifact esbuild cannot inline and is the hermetic formatter D3b rests on — this rule is forced, not stylistic.
- **The nine published dependencies, at these exact versions:** `@astryxdesign/core@0.1.4`, `@biomejs/js-api@6.0.0`, `@biomejs/wasm-nodejs@2.5.3`, `@hono/node-server@2.0.8`, `eta@4.6.0`, `hono@4.12.30`, `typescript@5.9.3`, `yaml@2.9.0`, `zod@4.4.3`.
- **Package name (E2):** `@boyscout/cli`. The bare name `boyscout` is taken on npm. Requires the npm org `boyscout`; if unavailable, fall back to `boyscout-cli` (confirmed free) — a `name` field change only, no code change.
- **Version:** `0.1.0-alpha.0`. **Dist-tag `alpha` (E5)** — `latest` stays unclaimed, so every documented install line must carry `@alpha`.
- **esbuild preserves the entry file's shebang** (verified empirically against esbuild 0.28.1: `#!/usr/bin/env node` in `src/bin.ts` is hoisted to line 1 of the output). **Do not add an esbuild `banner`** — that would emit a double shebang and break the binary.
- **Format before commit:** run `node_modules/.bin/biome format --write packages apps` before every commit — SP7's CI failed on format-check drift when only `lint` ran locally. Verify with `pnpm format:check`.
- **No generation-behavior changes.** SP9 ships the SP1–SP8 engine as-is. The only behavior additions are `init` and the `--ui-dist` default.

## File Structure

| File | Responsibility |
|---|---|
| `apps/cli/src/main.ts` (modify) | command switch; `runtimeVersion` source |
| `apps/cli/src/init.ts` (create) | `init()` scaffolding + `initCommand()` argv shim |
| `apps/cli/src/author/command.ts` (modify) | `defaultUiDist()` resolution |
| `apps/cli/build.mjs` (create) | esbuild bundle + `dist/ui` copy + README/LICENSE copy |
| `apps/cli/package.json` (modify) | publishable manifest |
| `README.md`, `LICENSE`, `CONTRIBUTING.md` (create) | public documentation |
| `.github/workflows/release.yml` (create) | tag-triggered gate → build → publish → release |
| `.github/workflows/ci.yml` (modify) | add pack gate to PRs |

**Verified facts this plan relies on** (do not re-litigate):
- No golden embeds a lock (`grep -rln runtimeVersion apps/cli/test/goldens` → empty), and both lockfile tests are version-agnostic (`packages/lockfile/test/closure.test.ts` passes `runtimeVersion` as a literal; `apps/cli/test/lockfile.test.ts` asserts behavior only). **The version bump breaks no test and no golden.**
- `spec.metadata.checksum` is **not** validated. Only `spec.metadata.bridge`/`platform` must equal the bridge's (`packages/runtime/src/index.ts:71`). `""` is accepted.
- Nothing imports `@boyscout/cli` as a package specifier — dropping its `exports` field is safe.

---

### Task 1: Version bump + `runtimeVersion` reads the CLI's own manifest

`main.ts` reads `createRequire(import.meta.url)("@boyscout/runtime/package.json")`. That specifier does not resolve in the published package — `@boyscout/runtime` is bundled, not installed. Reading `../package.json` resolves correctly from **both** `src/main.ts` (dev) and `dist/bin.js` (published). The bump lands first so the test can go red.

**Files:**
- Modify: `apps/cli/package.json` (`version`)
- Modify: `apps/cli/src/main.ts:12-14`
- Test: `apps/cli/test/version.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `apps/cli` at `version: "0.1.0-alpha.0"`; `boyscout.lock`'s `runtimeVersion` field now equals the CLI's version. The lock field **keeps the name `runtimeVersion`** — in a bundled distribution the CLI version *is* the runtime version.

- [ ] **Step 1: Bump the version so the test can fail**

In `apps/cli/package.json`, change `"version": "0.0.0"` to:

```json
  "version": "0.1.0-alpha.0",
```

- [ ] **Step 2: Write the failing test**

Create `apps/cli/test/version.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };
const specFixture = readFileSync(new URL("./fixtures/spec.json", import.meta.url), "utf8");
const configFixture = readFileSync(new URL("./fixtures/config.yaml", import.meta.url), "utf8");

describe("boyscout.lock records the CLI's own version", () => {
  it("runtimeVersion equals the CLI package.json version", () => {
    const dir = mkdtempSync(join(tmpdir(), "bs-ver-"));
    writeFileSync(join(dir, "spec.json"), specFixture);
    writeFileSync(join(dir, "config.yaml"), configFixture);

    const code = main([
      "generate",
      "--spec",
      join(dir, "spec.json"),
      "--config",
      join(dir, "config.yaml"),
    ]);
    expect(code).toBe(0);

    const lock = JSON.parse(readFileSync(join(dir, "boyscout.lock"), "utf8")) as {
      runtimeVersion: string;
    };
    expect(lock.runtimeVersion).toBe(pkg.version);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run apps/cli/test/version.test.ts`
Expected: FAIL — `expected '0.0.0' to be '0.1.0-alpha.0'`. The lock still carries `@boyscout/runtime`'s `0.0.0` while the CLI is now `0.1.0-alpha.0`.

- [ ] **Step 4: Change the version source**

In `apps/cli/src/main.ts`, replace:

```ts
const runtimeVersion = (
  createRequire(import.meta.url)("@boyscout/runtime/package.json") as { version: string }
).version;
```

with:

```ts
// The published CLI bundles @boyscout/runtime, so that package is not resolvable at runtime.
// `../package.json` resolves from both src/main.ts (dev) and dist/bin.js (published); in a
// bundled distribution the CLI version *is* the runtime version.
const runtimeVersion = (
  createRequire(import.meta.url)("../package.json") as { version: string }
).version;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run apps/cli/test/version.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite — no golden or lock test may regress**

Run: `pnpm test`
Expected: all PASS. (Verified: no golden embeds a lock; both lockfile tests are version-agnostic.)

- [ ] **Step 7: Format, typecheck, commit**

```bash
node_modules/.bin/biome format --write apps
pnpm --filter @boyscout/cli typecheck
git add apps/cli/package.json apps/cli/src/main.ts apps/cli/test/version.test.ts
git commit -m "feat(cli): version 0.1.0-alpha.0; runtimeVersion from own manifest

The published CLI bundles @boyscout/runtime, so requiring its package.json
fails once installed from npm. Read ../package.json instead — resolves from
both src/main.ts and dist/bin.js."
```

---

### Task 2: `boyscout init` command

Makes the README's headline Claude Code path real and gives SP8a's `composeSkill()` its first user-facing surface. Create-if-absent (D2b), so re-running it in a live project cannot destroy a tuned config or an edited skill file.

**Files:**
- Create: `apps/cli/src/init.ts`
- Modify: `apps/cli/src/main.ts` (command switch + usage string)
- Modify: `apps/cli/package.json` (add `@boyscout/skill-template` dependency)
- Test: `apps/cli/test/init.test.ts` (new)

**Interfaces:**
- Consumes: `composeSkill(bridges: readonly Bridge[], meta: SkillMeta): string` from `@boyscout/skill-template`, where `SkillMeta = { name: string; description: string }`; `bridge` from `@boyscout/bridge-astryx-react` (`id: "astryx-react"`, `platform: "react"`); `canonicalJson`/`writeBytes` from `@boyscout/determinism`.
- Produces: `init(root: string): InitResult` where `InitResult = { readonly created: readonly string[]; readonly skipped: readonly string[] }`, and `initCommand(argv: string[]): number`. Task 4 (build) bundles `@boyscout/skill-template` as a result of the new dependency.

- [ ] **Step 1: Add the skill-template dependency**

```bash
pnpm --filter @boyscout/cli add @boyscout/skill-template@workspace:*
```

- [ ] **Step 2: Write the failing test**

Create `apps/cli/test/init.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { init } from "../src/init.js";
import { main } from "../src/main.js";

const SKILL = join(".claude", "skills", "boyscout", "SKILL.md");

function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), "bs-init-"));
}

describe("boyscout init", () => {
  it("creates config, seed spec, and the Claude Code skill", () => {
    const dir = emptyProject();
    const result = init(dir);

    expect(result.created).toEqual(["boyscout.config.yaml", "boyscout-spec.json", SKILL]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
    expect(existsSync(join(dir, "boyscout-spec.json"))).toBe(true);
    expect(existsSync(join(dir, SKILL))).toBe(true);
  });

  it("composes the Astryx bridge's knowledge into SKILL.md", () => {
    const dir = emptyProject();
    init(dir);
    const skill = readFileSync(join(dir, SKILL), "utf8");
    expect(skill).toContain("name: \"boyscout\"");
    expect(skill).toContain("### astryx-react");
  });

  it("never overwrites an existing file (create-if-absent, D2b)", () => {
    const dir = emptyProject();
    writeFileSync(join(dir, "boyscout.config.yaml"), "platform: mine\n");

    const result = init(dir);

    expect(result.skipped).toEqual(["boyscout.config.yaml"]);
    expect(result.created).toEqual(["boyscout-spec.json", SKILL]);
    expect(readFileSync(join(dir, "boyscout.config.yaml"), "utf8")).toBe("platform: mine\n");
  });

  it("is idempotent — a second run creates nothing", () => {
    const dir = emptyProject();
    init(dir);
    const second = init(dir);
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual(["boyscout.config.yaml", "boyscout-spec.json", SKILL]);
  });

  it("seeds a project that actually generates", () => {
    const dir = emptyProject();
    init(dir);
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(0);
  });

  it("main routes the init command and exits 0", () => {
    const dir = emptyProject();
    expect(main(["init", "--root", dir])).toBe(0);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run apps/cli/test/init.test.ts`
Expected: FAIL — cannot resolve `../src/init.js`.

- [ ] **Step 4: Implement `init.ts`**

Create `apps/cli/src/init.ts`:

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { canonicalJson, writeBytes } from "@boyscout/determinism";
import { composeSkill } from "@boyscout/skill-template";

/** The config `init` seeds: the Astryx/React bridge, declarative `component` tier only. */
const CONFIG_YAML = `platform: react
bridge: astryx-react
capabilities:
  - component
`;

/**
 * Minimal valid Specification. `metadata.bridge`/`platform` must equal the bridge's or the
 * Runtime rejects it (packages/runtime/src/index.ts:71); `checksum` is not validated.
 */
const SEED_SPEC = {
  version: "1",
  features: [
    {
      id: "user-card",
      capability: "component",
      approved: true,
      annotations: {},
      props: {},
      tree: {
        type: "Card",
        children: [
          {
            type: "VStack",
            props: { gap: 2 },
            children: [
              { type: "Heading", props: { level: 3, text: "Profile" } },
              { type: "Text", props: { text: "Member since 2026", type: "body" } },
              { type: "Button", props: { text: "Edit", variant: "primary" } },
            ],
          },
        ],
      },
    },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

const SKILL_META = {
  name: "boyscout",
  description:
    "BoyScout bridge conventions for this project — the imports, tokens, architecture, and naming its generated code follows.",
};

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Scaffold a BoyScout project under `root`. Create-if-absent (D2b): an existing file is never
 * overwritten, so `init` is safe to re-run in a live project. Only the configured bridge's
 * knowledge is composed — seeding Material conventions into a React project would misinform
 * the agent.
 */
export function init(root: string): InitResult {
  const files: ReadonlyArray<readonly [string, string]> = [
    ["boyscout.config.yaml", CONFIG_YAML],
    ["boyscout-spec.json", canonicalJson(SEED_SPEC)],
    [join(".claude", "skills", "boyscout", "SKILL.md"), composeSkill([astryxBridge], SKILL_META)],
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of files) {
    const abs = join(root, rel);
    if (existsSync(abs)) {
      skipped.push(rel);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, writeBytes(content));
    created.push(rel);
  }
  return { created, skipped };
}

/** `boyscout init [--root .]` */
export function initCommand(argv: string[]): number {
  const i = argv.indexOf("--root");
  const root = i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : ".";
  const { created, skipped } = init(root);
  for (const rel of created) process.stdout.write(`created ${rel}\n`);
  for (const rel of skipped) process.stdout.write(`exists, skipped ${rel}\n`);
  return 0;
}
```

- [ ] **Step 5: Wire `init` into the command switch**

In `apps/cli/src/main.ts`, add the import beside the existing `authorCommand` import:

```ts
import { initCommand } from "./init.js";
```

Then in `main()`, replace:

```ts
  const command = argv[0];
  if (command === "author") return authorCommand(argv.slice(1));
  if (command !== "generate") {
    process.stderr.write(
      `unknown command: ${command ?? "(none)"}\nusage: boyscout generate | boyscout author\n`,
    );
    return 1;
  }
```

with:

```ts
  const command = argv[0];
  if (command === "init") return initCommand(argv.slice(1));
  if (command === "author") return authorCommand(argv.slice(1));
  if (command !== "generate") {
    process.stderr.write(
      `unknown command: ${command ?? "(none)"}\nusage: boyscout init | boyscout generate | boyscout author\n`,
    );
    return 1;
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run apps/cli/test/init.test.ts`
Expected: all 6 PASS.

- [ ] **Step 7: Run the full suite, format, typecheck, commit**

```bash
pnpm test
node_modules/.bin/biome format --write apps
pnpm --filter @boyscout/cli typecheck
git add apps/cli/src/init.ts apps/cli/src/main.ts apps/cli/test/init.test.ts apps/cli/package.json pnpm-lock.yaml
git commit -m "feat(cli): add create-if-absent \`boyscout init\`

Scaffolds boyscout.config.yaml, a seed spec, and the composed
.claude/skills/boyscout/SKILL.md — giving SP8a's composeSkill() its first
user-facing surface. Never overwrites an existing file (D2b)."
```

---

### Task 3: `--ui-dist` resolves in both the monorepo and the published package

`authorCommand` defaults `--ui-dist` to `../../../boyscout-ui/dist`, a monorepo-relative path that does not exist in the published tree. Task 4's build copies the UI to `dist/ui` beside `dist/bin.js`; this task teaches the default to prefer it.

**Files:**
- Modify: `apps/cli/src/author/command.ts:40-42`
- Test: `apps/cli/test/ui-dist.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: `defaultUiDist(): string` exported from `./author/command.js`. Task 4's build must place the UI at `dist/ui` for this to select the bundled path.

- [ ] **Step 1: Write the failing test**

Create `apps/cli/test/ui-dist.test.ts`:

```ts
import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultUiDist } from "../src/author/command.js";

describe("defaultUiDist", () => {
  it("falls back to the monorepo boyscout-ui build when no bundled ./ui exists", () => {
    // These tests run from src/author/, where ./ui never exists (build output lands in
    // dist/ui) — so the dev branch must win here whether or not the CLI has been built.
    const resolved = defaultUiDist();
    expect(resolved).toContain("boyscout-ui");
    expect(resolved.endsWith("dist")).toBe(true);
  });

  it("returns an absolute path", () => {
    expect(isAbsolute(defaultUiDist())).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run apps/cli/test/ui-dist.test.ts`
Expected: FAIL — `defaultUiDist` is not exported from `../src/author/command.js`.

- [ ] **Step 3: Implement `defaultUiDist`**

In `apps/cli/src/author/command.ts`, add above `authorCommand` (all of `existsSync`, `fileURLToPath` are already imported):

```ts
/**
 * Published layout: `dist/ui` sits beside `dist/bin.js`. Dev layout: the monorepo's Vite build.
 * Prefer the bundled copy when present so `author` works both from source and from npm.
 */
export function defaultUiDist(): string {
  const bundled = fileURLToPath(new URL("./ui", import.meta.url));
  return existsSync(bundled)
    ? bundled
    : fileURLToPath(new URL("../../../boyscout-ui/dist", import.meta.url));
}
```

Then replace:

```ts
  const uiDist = resolve(
    flag(argv, "--ui-dist", fileURLToPath(new URL("../../../boyscout-ui/dist", import.meta.url))),
  );
```

with:

```ts
  const uiDist = resolve(flag(argv, "--ui-dist", defaultUiDist()));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run apps/cli/test/ui-dist.test.ts`
Expected: both PASS.

- [ ] **Step 5: Run the full suite, format, typecheck, commit**

```bash
pnpm test
node_modules/.bin/biome format --write apps
pnpm --filter @boyscout/cli typecheck
git add apps/cli/src/author/command.ts apps/cli/test/ui-dist.test.ts
git commit -m "feat(cli): resolve --ui-dist from the bundled dist/ui when present

The monorepo-relative default does not exist in the published package.
Prefer ./ui beside the entry, fall back to the monorepo build."
```

---

### Task 4: README, LICENSE, CONTRIBUTING

Lands before the build because `build.mjs` (Task 5) copies `README.md` and `LICENSE` into the package directory — npm sources those from the package dir, not the repo root.

**Files:**
- Create: `README.md`, `LICENSE`, `CONTRIBUTING.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `README.md` and `LICENSE` at the repo root, which Task 5's `build.mjs` copies into `apps/cli/`.

- [ ] **Step 1: Write the LICENSE**

Create `LICENSE`:

```
MIT License

Copyright (c) 2026 Vivaldo Mendonça Pinto

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write the README**

Create `README.md`. The logo **must** use the absolute `raw.githubusercontent.com` URL — npm renders this same file on the package page, where a relative `docs/logo.png` 404s:

````markdown
<p align="center">
  <img src="https://raw.githubusercontent.com/vivaldomp/boyscout/master/docs/logo.png" alt="BoyScout" width="160">
</p>

<h1 align="center">BoyScout</h1>

<p align="center">
  <strong>Governed deterministic runtime for software generation.</strong><br>
  AI decides <em>what</em> to build. The Runtime decides <em>how</em>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white" alt="Node >=20">
  <img src="https://img.shields.io/badge/pnpm-10.32-F69220?logo=pnpm&logoColor=white" alt="pnpm 10.32">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: alpha">
  <img src="https://github.com/vivaldomp/boyscout/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

> **Alpha.** The API can break between alpha releases. Every install line below pins `@alpha` on purpose — the `latest` tag is deliberately unclaimed.

---

## Why BoyScout?

Ask an AI agent to build a login form and you get *a* login form — plausible, idiomatic to nobody, subtly different from the last one it wrote. Ask ten times, get ten answers. The generated code is a suggestion, and every suggestion costs a review.

BoyScout splits the problem in two. **AI decides what to build; the Runtime decides how.** Your engineering standards stop being a style guide nobody reads and become executable artifacts — **Bridges, Providers, Templates, and Guardrails** — that the Runtime executes:

- **Deterministic.** The same spec and the same `boyscout.lock` produce **byte-for-byte identical output** on Linux, macOS, and Windows. Not "equivalent". Identical. It is proven by golden-file CI on all three.
- **Governed.** A guardrail violation **fails the gate** and emits nothing. Non-conforming code does not reach your repository to be argued about in review.
- **Framework-agnostic.** The Runtime knows nothing about React. Bridges teach it. Astryx/React and Material/Angular both pass the identical Runtime contract suite.
- **It leaves your code better than it found it.** Regeneration preserves human-authored logic; drift between generated scaffolding and your code surfaces as a compile error, not a silent overwrite.

## Quick start

### Install

BoyScout is built to be driven by a coding agent. `init` writes a `SKILL.md` that teaches **Claude Code** your bridge's conventions, so the agent proposes specs that fit your standards:

```bash
npx @boyscout/cli@alpha init
```

```
created boyscout.config.yaml
created boyscout-spec.json
created .claude/skills/boyscout/SKILL.md
```

<details>
<summary><strong>Other install methods</strong></summary>

```bash
# npm
npm install -g @boyscout/cli@alpha

# pnpm
pnpm add -g @boyscout/cli@alpha

# yarn
yarn global add @boyscout/cli@alpha

# bun
bun add -g @boyscout/cli@alpha
```

Then run `boyscout` instead of `npx @boyscout/cli@alpha`.

</details>

### Your first design

`init` seeds a project with a small component spec. Generate it:

```bash
npx @boyscout/cli@alpha generate
```

```
src/components/UserCard.tsx
.running/UserCard.scaffold.tsx
boyscout.lock
```

Three things just happened:

1. **`.running/UserCard.scaffold.tsx`** is generated, disposable, and overwritten on every run — the Runtime owns it.
2. **`src/components/UserCard.tsx`** is yours. It is created once and **never overwritten**. Put your logic there; regenerate as often as you like.
3. **`boyscout.lock`** pins the closure that produced those bytes. Commit it.

Now ask Claude Code for something of your own — *"add a signup form with email and password"* — and run `generate` again. The agent writes the spec; the Runtime decides how it is built.

Verify the guarantee — regenerate and confirm nothing drifted:

```bash
npx @boyscout/cli@alpha generate --check
```

> Same spec + same lock = same bytes. On any machine, on any OS.

There is also a browser authoring loop (`boyscout author`) that previews a `.openui` design before you approve it into a spec — see [CONTRIBUTING.md](CONTRIBUTING.md) to run it from source.

## Contributing

Contributions are welcome — please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. It covers development setup, running locally, the test suite, and the pull request gates.

One requirement is unusual and worth flagging up front: this repository maintains a **spec → plan → implementation traceability chain**, and contributions are expected to be produced with an **Opus- or Sonnet-class model running the [superpowers](https://github.com/obra/superpowers) skills** so that chain stays intact. CONTRIBUTING explains what that means in practice.

## License

[MIT](LICENSE) © 2026 Vivaldo Mendonça Pinto
````

- [ ] **Step 3: Write CONTRIBUTING.md**

Create `CONTRIBUTING.md`:

````markdown
# Contributing to BoyScout

Thanks for considering a contribution. This document covers how to set the project up, run it, test it, and open a pull request — plus one requirement specific to this repository that you should read before you start.

## Before you start: models and traceability

**Contributions are expected to be produced with an Opus- or Sonnet-class model running the [superpowers](https://github.com/obra/superpowers) skills.**

This is not a style preference. Every sub-project in this repository (SP1 through SP8) landed as a traceable chain:

```
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md    ← the spec: what and why, with decisions
docs/superpowers/plans/YYYY-MM-DD-<topic>.md           ← the plan: bite-sized TDD tasks
.superpowers/sdd/progress.md                           ← the ledger: branch, base, spec, plan, tasks
.superpowers/sdd/review-<base>..<head>.diff            ← per-task review diffs
```

A pull request that arrives as bare commits with no spec and no plan cannot be reviewed against intent — and intent is the only thing that makes a determinism guarantee reviewable. "Does this code work?" is answerable from the diff. "Should this code exist, and does it preserve byte-identity?" is not.

The model class is named explicitly because smaller models reliably drift off the skill workflow and skip the artifacts silently — producing a PR that looks complete and is untraceable. If you cannot run those models, open an issue describing the change and we will pair on the spec.

The workflow, end to end:

1. `superpowers:brainstorming` → a design doc in `docs/superpowers/specs/`, reviewed and committed.
2. `superpowers:writing-plans` → a task-by-task plan in `docs/superpowers/plans/`.
3. `superpowers:subagent-driven-development` or `superpowers:executing-plans` → implementation, one commit per task.

## Development Setup

**Requirements:** Node ≥ 20, pnpm 10.32.1 (the repo pins `packageManager`; use `corepack enable` to honour it).

```bash
git clone https://github.com/vivaldomp/boyscout.git
cd boyscout
pnpm install
```

There is **no build step for the packages.** All 15 workspace packages export `./src/index.ts` directly and run through `tsx`. Only `apps/cli` has a build, and only because it is the published artifact.

## Running Locally

Run the CLI straight from TypeScript source:

```bash
# scaffold a project in a scratch directory
pnpm --filter @boyscout/cli exec tsx src/bin.ts init --root /tmp/demo

# generate
cd /tmp/demo
pnpm --filter @boyscout/cli exec tsx src/bin.ts generate

# verify the lock has not drifted
pnpm --filter @boyscout/cli exec tsx src/bin.ts generate --check
```

The browser authoring loop needs the UI bundle built first:

```bash
pnpm --filter boyscout-ui build
pnpm --filter @boyscout/cli exec tsx src/bin.ts author --openui ./boyscout.openui
```

`author` binds loopback-only (`127.0.0.1`) and mints a CSPRNG session token per run — see §21 of `docs/FIRST-SPEC.md` and `docs/security-checklist.md`. Overriding `--host` is an explicit, deliberate act.

To exercise the published bundle rather than the source:

```bash
pnpm --filter boyscout-ui build
pnpm --filter @boyscout/cli build
node apps/cli/dist/bin.js init --root /tmp/demo2
```

## Tests

```bash
pnpm test           # vitest, the whole workspace
pnpm typecheck      # tsc --noEmit, every package, in parallel
pnpm lint           # biome lint
pnpm format:check   # biome format, check only
```

**Goldens.** `apps/cli/test/goldens/` holds committed byte-exact expected output. They are the proof of D3b — cross-OS byte-identity — and CI runs them on Ubuntu, macOS, and Windows. If a change *legitimately* alters generated bytes:

```bash
pnpm golden:update
```

Then **read the diff before committing it.** A golden diff you did not intend is a determinism regression, and it is the single most important signal this repository produces. Never update goldens to make a red test green.

**E2E.** Playwright drives the full agent → CLI → browser → approve → generate chain. It is Ubuntu-only in CI; cross-OS coverage comes from the golden matrix.

```bash
pnpm --filter boyscout-ui build
pnpm --filter boyscout-ui exec playwright install --with-deps chromium
pnpm --filter boyscout-ui e2e
```

**Writing tests.** Follow TDD: write the failing test, watch it fail for the reason you expect, then make it pass. Tests assert behaviour, not implementation. Determinism tests in particular must assert *bytes*, not "looks equivalent".

## Pull Requests

1. Branch off `master` (`git checkout -b <topic>`).
2. Commit your spec and plan first, then implement — one commit per task.
3. Run every gate locally; CI runs all four on three operating systems:

   ```bash
   node_modules/.bin/biome format --write packages apps
   pnpm typecheck && pnpm test && pnpm format:check && pnpm lint
   ```

   Run `format --write` before committing. Running only `lint` locally has broken CI on format drift before.
4. Open the PR against `master`. Link the spec and plan. Describe what changed in generated bytes, if anything — "no golden changes" is a meaningful statement.

All four gates must be green on all three operating systems before merge.

## Releasing

Maintainers only. Releases publish `@boyscout/cli` from a pushed tag via `.github/workflows/release.yml`, authenticated with npm **trusted publishing** (OIDC) — there is no `NPM_TOKEN` secret in this repository.

```bash
# bump apps/cli/package.json version first, and commit it
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1
```

The workflow verifies the tag matches `apps/cli/package.json`, runs the full gate, builds, packs, publishes under the `alpha` dist-tag, and cuts a GitHub Release.

**One-time bootstrap** (trusted publishing links an *existing* package to a repo, so it cannot be configured before the package exists):

1. Create the npm org `boyscout`.
2. Publish once, manually and locally:
   ```bash
   pnpm --filter boyscout-ui build
   pnpm --filter @boyscout/cli build
   cd apps/cli && npm publish --access public --tag alpha
   ```
3. On npmjs.com, open `@boyscout/cli` → Settings → Trusted Publisher, and link repository `vivaldomp/boyscout` with workflow `release.yml`.
4. Every release after that is a tag push.

The `latest` dist-tag stays unclaimed until 1.0 — alphas publish under `alpha` only, so nobody installs one by accident.
````

- [ ] **Step 4: Verify the README's logo URL resolves**

Run:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://raw.githubusercontent.com/vivaldomp/boyscout/master/docs/logo.png
```

Expected: `200`. If it returns `404`, `docs/logo.png` has not reached `master` yet — the URL will work once this branch merges. Note it in the task report and continue; do **not** switch to a relative path, which would break the npm package page.

- [ ] **Step 5: Format and commit**

Biome does not process Markdown — `biome format` on a `.md` file exits 1 with
"No files were processed" (verified against Biome 2.5.3). This task adds no
JS/TS, so there is nothing to format; `pnpm format:check` ignores `.md` and
stays green.

```bash
git add README.md LICENSE CONTRIBUTING.md
git commit -m "docs: add README, MIT LICENSE, and CONTRIBUTING

README leads with the Claude Code install path and a headless first design.
CONTRIBUTING documents the spec+plan traceability chain and the model-class
requirement that keeps it intact."
```

---

### Task 5: Publishable manifest + esbuild bundle

**Files:**
- Create: `apps/cli/build.mjs`
- Modify: `apps/cli/package.json` (full publishable manifest)
- Modify: `.gitignore` (ignore the README/LICENSE copies the build drops into `apps/cli/`)

**Interfaces:**
- Consumes: `README.md` + `LICENSE` from Task 4; `dist/ui` expectation from Task 3's `defaultUiDist()`; `@boyscout/skill-template` dependency from Task 2.
- Produces: `pnpm --filter @boyscout/cli build` → `apps/cli/dist/bin.js` (executable, shebang on line 1) + `apps/cli/dist/ui/`. Task 6's workflow calls this script.

- [ ] **Step 1: Add esbuild as a dev dependency**

```bash
pnpm --filter @boyscout/cli add -D esbuild@0.28.1
```

- [ ] **Step 2: Write the build script**

Create `apps/cli/build.mjs`:

```js
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const uiSrc = fileURLToPath(new URL("../boyscout-ui/dist", import.meta.url));

/**
 * E3: bundle @boyscout/* only; every third-party dependency stays external and is declared,
 * pinned, in package.json. This is forced, not stylistic — @biomejs/wasm-nodejs is a WASM
 * artifact esbuild cannot inline, and it is the hermetic formatter D3b's byte-identity rests
 * on. Externalising all third-party code keeps dev and published builds on identical paths.
 */
const external = [
  "@astryxdesign/core",
  "@biomejs/js-api",
  "@biomejs/wasm-nodejs",
  "@hono/node-server",
  "eta",
  "hono",
  "typescript",
  "yaml",
  "zod",
];

rmSync(`${root}dist`, { recursive: true, force: true });

// No `banner` — esbuild hoists the shebang already present in src/bin.ts to line 1.
// Adding one here would emit a double shebang and break the binary.
await build({
  entryPoints: [`${root}src/bin.ts`],
  outfile: `${root}dist/bin.js`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
});

if (!existsSync(uiSrc)) {
  console.error("boyscout-ui is not built — run: pnpm --filter boyscout-ui build");
  process.exit(1);
}
cpSync(uiSrc, `${root}dist/ui`, { recursive: true });

// npm sources README/LICENSE from the package directory, not the repo root.
cpSync(`${repo}README.md`, `${root}README.md`);
cpSync(`${repo}LICENSE`, `${root}LICENSE`);

console.log("built dist/bin.js + dist/ui");
```

- [ ] **Step 3: Ignore the copied files**

Append to `.gitignore`:

```
apps/cli/README.md
apps/cli/LICENSE
```

- [ ] **Step 4: Write the publishable manifest**

Replace `apps/cli/package.json` entirely. Note: `private` is gone, `exports` is gone (nothing imports `@boyscout/cli` as a package — verified), workspace deps are now `devDependencies` (they are bundled, so they are build-time only), and the nine third-party deps are pinned exactly:

```json
{
  "name": "@boyscout/cli",
  "version": "0.1.0-alpha.0",
  "description": "Governed deterministic runtime for software generation — AI decides what to build, the Runtime decides how.",
  "license": "MIT",
  "type": "module",
  "homepage": "https://github.com/vivaldomp/boyscout#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vivaldomp/boyscout.git",
    "directory": "apps/cli"
  },
  "bugs": { "url": "https://github.com/vivaldomp/boyscout/issues" },
  "keywords": ["codegen", "deterministic", "ai", "claude", "design-system", "governance"],
  "bin": { "boyscout": "./dist/bin.js" },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@astryxdesign/core": "0.1.4",
    "@biomejs/js-api": "6.0.0",
    "@biomejs/wasm-nodejs": "2.5.3",
    "@hono/node-server": "2.0.8",
    "eta": "4.6.0",
    "hono": "4.12.30",
    "typescript": "5.9.3",
    "yaml": "2.9.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@boyscout/bridge-astryx-react": "workspace:*",
    "@boyscout/bridge-material": "workspace:*",
    "@boyscout/determinism": "workspace:*",
    "@boyscout/dialect": "workspace:*",
    "@boyscout/guardrails": "workspace:*",
    "@boyscout/lockfile": "workspace:*",
    "@boyscout/questionnaire": "workspace:*",
    "@boyscout/runtime": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "@boyscout/skill-template": "workspace:*",
    "@boyscout/spec": "workspace:*",
    "esbuild": "0.28.1",
    "tsx": "^4.23.1"
  }
}
```

- [ ] **Step 5: Reinstall and build**

```bash
pnpm install
pnpm --filter boyscout-ui build
pnpm --filter @boyscout/cli build
```

Expected: `built dist/bin.js + dist/ui`, no esbuild errors about unresolved imports.

- [ ] **Step 6: Verify the shebang is present exactly once**

```bash
head -1 apps/cli/dist/bin.js
grep -c '^#!/usr/bin/env node' apps/cli/dist/bin.js
```

Expected: `#!/usr/bin/env node` then `1`. If the count is `0` or `2`, stop — the bundle's entry handling changed and the plan's shebang assumption needs revisiting.

- [ ] **Step 7: Smoke-test the built binary end to end**

This is the real proof the bundle works — it exercises the WASM formatter, the bridges, and the lockfile through the bundled entry, not through `tsx`:

```bash
REPO="$(git rev-parse --show-toplevel)"
BIN="$REPO/apps/cli/dist/bin.js"
rm -rf /tmp/bs-smoke && mkdir -p /tmp/bs-smoke
node "$BIN" init --root /tmp/bs-smoke
(cd /tmp/bs-smoke && node "$BIN" generate && node "$BIN" generate --check)
echo "exit=$?"
```

Expected: `init` prints three `created` lines; `generate` prints the emitted paths and writes `boyscout.lock`; `generate --check` prints nothing and `exit=0`. A non-zero exit or a `Cannot find package` error means a dependency is bundled that should be external, or external that should be bundled.

- [ ] **Step 8: Verify the tarball contents**

```bash
cd apps/cli && npm pack --dry-run 2>&1 | tail -30
```

Expected: the file list contains `dist/bin.js`, files under `dist/ui/`, `package.json`, `README.md`, and `LICENSE` — and **nothing** from `src/` or `test/`. If `npm pack` errors on `workspace:*` inside `devDependencies`, strip `devDependencies` from the manifest in `build.mjs` before packing (write the pruned manifest to `dist/`-adjacent staging) and note the deviation in the task report.

- [ ] **Step 9: Confirm the existing suite still passes**

```bash
cd "$(git rev-parse --show-toplevel)"
pnpm test && pnpm typecheck && pnpm format:check && pnpm lint
```

Expected: all green. The manifest change must not disturb the workspace — `tsx`-based tests still resolve workspace packages through `devDependencies`.

- [ ] **Step 10: Commit**

```bash
node_modules/.bin/biome format --write apps
git add apps/cli/package.json apps/cli/build.mjs .gitignore pnpm-lock.yaml
git commit -m "build(cli): publishable manifest + esbuild bundle

Bundles @boyscout/* into dist/bin.js and copies boyscout-ui's build to
dist/ui. All nine third-party deps stay external and pinned exactly:
@biomejs/wasm-nodejs is WASM esbuild cannot inline, and pinning protects
the D3b byte-identity guarantee from a silent formatter patch bump."
```

---

### Task 6: Release workflow + CI pack gate

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml` (add a `pack` job)

**Interfaces:**
- Consumes: `pnpm --filter @boyscout/cli build` from Task 5.
- Produces: a tag-triggered publish. No further tasks depend on this.

- [ ] **Step 1: Write the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release

on:
  push:
    tags: ["v*"]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # OIDC -> npm trusted publishing
      contents: write # gh release create
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
          registry-url: "https://registry.npmjs.org"

      # Node 20 ships npm 10; trusted publishing (OIDC) needs npm >= 11.5.1. Without this,
      # npm ignores OIDC, looks for a token that does not exist, and the publish fails.
      - name: Upgrade npm for trusted publishing
        run: npm install -g npm@latest

      - run: pnpm install --frozen-lockfile

      - name: Verify tag matches the package version
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          PKG="$(node -p "require('./apps/cli/package.json').version")"
          if [ "$TAG" != "$PKG" ]; then
            echo "tag $TAG != apps/cli version $PKG" >&2
            exit 1
          fi
          echo "releasing $PKG"

      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm format:check
      - run: pnpm lint

      - run: pnpm --filter boyscout-ui build
      - run: pnpm --filter @boyscout/cli build

      - name: Verify the tarball before publishing
        working-directory: apps/cli
        run: npm pack --dry-run

      - name: Publish to npm
        working-directory: apps/cli
        run: npm publish --access public --tag alpha

      - name: Create the GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" --generate-notes --prerelease
```

- [ ] **Step 2: Add the pack gate to CI**

In `.github/workflows/ci.yml`, append this job after the existing `e2e` job. It catches a packaging regression on the PR instead of on a tag, when publishing is irreversible:

```yaml
  pack:
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
      - run: pnpm --filter @boyscout/cli build
      - name: Shebang present exactly once
        run: |
          test "$(grep -c '^#!/usr/bin/env node' apps/cli/dist/bin.js)" = "1"
      - name: Bundled CLI scaffolds and generates
        run: |
          mkdir -p /tmp/bs-smoke
          node apps/cli/dist/bin.js init --root /tmp/bs-smoke
          cd /tmp/bs-smoke
          node "$GITHUB_WORKSPACE/apps/cli/dist/bin.js" generate
          node "$GITHUB_WORKSPACE/apps/cli/dist/bin.js" generate --check
      - name: Tarball is well-formed
        working-directory: apps/cli
        run: npm pack --dry-run
```

- [ ] **Step 3: Validate the workflow YAML parses**

```bash
node -e '
const {readFileSync}=require("fs");
const {parse}=require("yaml");
for (const f of [".github/workflows/release.yml",".github/workflows/ci.yml"]) {
  const doc=parse(readFileSync(f,"utf8"));
  console.log(f,"jobs:",Object.keys(doc.jobs).join(", "));
}'
```

Expected: `release.yml jobs: publish` and `ci.yml jobs: test, e2e, pack`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml .github/workflows/ci.yml
git commit -m "ci: tag-triggered release via npm trusted publishing

Pushing v* gates, builds, packs, publishes under the alpha dist-tag, and
cuts a GitHub Release. No NPM_TOKEN — OIDC, which needs npm >= 11.5.1, so
the workflow upgrades npm past the version Node 20 ships.

Adds a pack job to CI so packaging regressions fail on the PR rather than
on a tag, when publishing is irreversible."
```

- [ ] **Step 5: Push the branch and confirm CI is green**

```bash
git push -u origin sp9-npm-alpha-distribution
```

Expected: the `test` matrix (3 OSes), `e2e`, and the new `pack` job all pass. `release.yml` does **not** run — it is tag-triggered only.

---

## Post-merge: the one-time bootstrap

**Not automatable, and not a task** — trusted publishing links an *existing* package to a repo, so it cannot be configured before the package exists. After merge, the maintainer:

1. Creates the npm org `boyscout` at https://www.npmjs.com/org/create. **If the org is unavailable**, fall back to `boyscout-cli`: change `name` in `apps/cli/package.json`, drop `publishConfig.access` (unscoped packages are public by default), and update the install lines in `README.md` and `CONTRIBUTING.md`. No code changes.
2. Publishes once, manually:
   ```bash
   pnpm --filter boyscout-ui build
   pnpm --filter @boyscout/cli build
   cd apps/cli && npm publish --access public --tag alpha
   ```
3. Configures trusted publishing on npmjs.com: `@boyscout/cli` → Settings → Trusted Publisher → repository `vivaldomp/boyscout`, workflow `release.yml`.
4. Verifies: `npm view @boyscout/cli dist-tags` shows `alpha: 0.1.0-alpha.0` and **no `latest`**.
5. From then on, releases are `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Verification checklist

- [ ] `npx @boyscout/cli@alpha init` in an empty directory creates config, spec, and `SKILL.md`
- [ ] `npx @boyscout/cli@alpha generate` emits a component and `boyscout.lock`
- [ ] `npx @boyscout/cli@alpha generate --check` exits 0 against a fresh lock
- [ ] `init` run twice creates nothing the second time and overwrites nothing
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm format:check`, `pnpm lint` green on all 3 OSes
- [ ] `npm view @boyscout/cli dist-tags` → `alpha` present, `latest` absent
- [ ] The README logo renders on both github.com and the npm package page
