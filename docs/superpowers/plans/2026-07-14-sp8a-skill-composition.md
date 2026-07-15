# SP8a — Skill Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed Bridge Skill slot to the contract, a `@boyscout/skill-template` composer that renders selected bridges into a byte-stable agentskills.io `SKILL.md`, and real fragment content on both bridges.

**Architecture:** A new optional `skill` field on the `Bridge` contract carries five typed knowledge strings. A single pure function `composeSkill(bridges, meta)` sorts bridges by id, renders fixed-order sections with per-bridge sub-blocks, and returns a canonical (LF, single trailing newline) string. Both real bridges populate their fragments; a shared contract helper asserts presence.

**Tech Stack:** TypeScript (strict, ESM, no build step — packages export `./src/index.ts`), vitest, `@boyscout/determinism` (`sortByBytes`, `writeBytes`), pnpm workspaces, Biome.

**Spec:** `docs/superpowers/specs/2026-07-14-sp8a-skill-composition-design.md`

## Global Constraints

- **ESM only**, `"type": "module"`, no build step — packages export `./src/index.ts` directly. Relative imports on `.ts` source use `.js` specifiers.
- **Strict TS**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Type-only imports use `import type` / inline `type`. Optional props assigned via conditional-spread (`...(x ? { k: x } : {})`) — never `k: undefined`.
- **Bridge ids are `astryx-react` and `material`** (not the package names). `composeSkill` renders `### <bridge.id>` sub-blocks, so headings are `### astryx-react` / `### material`.
- **Invariant:** the Runtime never reads `bridge.skill`. Do not add any read of `bridge.skill` in `packages/runtime`. Only `skill-template` (and its tests) touch it.
- **Tests:** `pnpm exec vitest run <path>`. **Typecheck:** `pnpm --filter <pkg> typecheck` / `pnpm -r typecheck`.
- **Lint:** `node_modules/.bin/biome lint packages apps`. **Format:** `node_modules/.bin/biome format packages apps`. Run **format before every commit** (SP7 CI failed on format-check drift when only lint was run locally).

---

## File Structure

- `packages/schemas/src/index.ts` — **modify**: add `BridgeSkill` interface + optional `skill?` on `Bridge`.
- `packages/skill-template/package.json` — **create**: new package `@boyscout/skill-template`.
- `packages/skill-template/tsconfig.json` — **create**.
- `packages/skill-template/src/index.ts` — **create**: `composeSkill` + `SkillMeta`.
- `packages/skill-template/test/compose.test.ts` — **create**: composer unit tests (stub bridges).
- `packages/skill-template/test/real-bridges.test.ts` — **create**: integration over both real bridges.
- `packages/bridge-contract-kit/src/index.ts` — **modify**: add `runSkillContract` helper.
- `packages/bridges/bridge-astryx-react/src/skill.ts` — **create**: fragment content.
- `packages/bridges/bridge-astryx-react/src/index.ts` — **modify**: wire `skill` onto the bridge.
- `packages/bridges/bridge-astryx-react/test/skill-contract.test.ts` — **create**.
- `packages/bridges/bridge-material/src/skill.ts` — **create**: fragment content.
- `packages/bridges/bridge-material/src/index.ts` — **modify**: wire `skill` onto the bridge.
- `packages/bridges/bridge-material/test/skill-contract.test.ts` — **create**.

---

## Task 1: BridgeSkill contract slot

**Files:**
- Modify: `packages/schemas/src/index.ts` (Bridge interface, ~lines 155–161)

**Interfaces:**
- Produces: `interface BridgeSkill { readonly conventions: string; readonly imports: string; readonly tokens: string; readonly architecture: string; readonly naming: string }` and `Bridge.skill?: BridgeSkill`.

- [ ] **Step 1: Add the `BridgeSkill` interface and the optional field**

In `packages/schemas/src/index.ts`, immediately above the existing `export interface Bridge {` block, add:

```ts
/**
 * A Bridge's knowledge fragment (FIRST-SPEC §3.1). Prose per section; consumed
 * only by @boyscout/skill-template to compose an agentskills.io SKILL.md.
 * The Runtime never reads this.
 */
export interface BridgeSkill {
  readonly conventions: string;
  readonly imports: string;
  readonly tokens: string;
  readonly architecture: string;
  readonly naming: string;
}
```

Then add the field to `Bridge` (keep the existing members; append the new line):

```ts
export interface Bridge {
  readonly id: string;
  readonly platform: string;
  readonly registry: BridgeRegistry;
  readonly postRules: readonly AssetRule[];
  /** Optional Bridge Skill fragment (SP8a). Consumed only by skill-template. */
  readonly skill?: BridgeSkill;
}
```

- [ ] **Step 2: Verify the whole repo still typechecks**

Run: `pnpm -r typecheck`
Expected: PASS for all packages (the field is optional, so existing Bridge constructions are unaffected).

- [ ] **Step 3: Format + lint**

Run: `node_modules/.bin/biome format --write packages/schemas && node_modules/.bin/biome lint packages`
Expected: no diagnostics.

- [ ] **Step 4: Commit**

```bash
git add packages/schemas/src/index.ts
git commit -m "feat(sp8a): typed BridgeSkill slot on the Bridge contract"
```

---

## Task 2: skill-template composer

**Files:**
- Create: `packages/skill-template/package.json`
- Create: `packages/skill-template/tsconfig.json`
- Create: `packages/skill-template/src/index.ts`
- Create: `packages/skill-template/test/compose.test.ts`

**Interfaces:**
- Consumes: `Bridge`, `BridgeSkill` from `@boyscout/schemas` (Task 1); `sortByBytes`, `writeBytes` from `@boyscout/determinism`.
- Produces: `composeSkill(bridges: readonly Bridge[], meta: SkillMeta): string` and `interface SkillMeta { readonly name: string; readonly description: string }`.

- [ ] **Step 1: Create the package manifest**

Create `packages/skill-template/package.json`:

```json
{
  "name": "@boyscout/skill-template",
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
    "@boyscout/bridge-astryx-react": "workspace:*",
    "@boyscout/bridge-material": "workspace:*"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

Create `packages/skill-template/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Link the new package into the workspace**

Run: `pnpm install`
Expected: lockfile updates; `@boyscout/skill-template` and its workspace deps resolve.

- [ ] **Step 4: Write the failing composer test**

Create `packages/skill-template/test/compose.test.ts`:

```ts
import { writeBytes } from "@boyscout/determinism";
import type { Bridge, BridgeSkill } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

const emptyRegistry = {
  capabilities: [] as const,
  nodeTypesFor: () => [],
  paramsFor: () => [],
  providerFor: () => undefined,
};

function stubBridge(id: string, skill?: BridgeSkill): Bridge {
  return {
    id,
    platform: "test",
    registry: emptyRegistry,
    postRules: [],
    ...(skill ? { skill } : {}),
  };
}

const fullSkill = (tag: string): BridgeSkill => ({
  conventions: `${tag} conventions`,
  imports: `${tag} imports`,
  tokens: `${tag} tokens`,
  architecture: `${tag} architecture`,
  naming: `${tag} naming`,
});

describe("composeSkill", () => {
  it("emits agentskills.io frontmatter", () => {
    const md = composeSkill([stubBridge("a", fullSkill("A"))], {
      name: "boyscout",
      description: "governed generation",
    });
    expect(
      md.startsWith("---\nname: boyscout\ndescription: governed generation\n---"),
    ).toBe(true);
  });

  it("renders sections in fixed order", () => {
    const md = composeSkill([stubBridge("a", fullSkill("A"))], { name: "s", description: "d" });
    const order = ["## Conventions", "## Imports", "## Tokens", "## Architecture", "## Naming"].map(
      (h) => md.indexOf(h),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("groups bridges under each section, sorted by id", () => {
    const md = composeSkill([stubBridge("zed", fullSkill("Z")), stubBridge("abe", fullSkill("A"))], {
      name: "s",
      description: "d",
    });
    const conv = md.slice(md.indexOf("## Conventions"), md.indexOf("## Imports"));
    expect(conv).toContain("### abe");
    expect(conv).toContain("### zed");
    expect(conv.indexOf("### abe")).toBeLessThan(conv.indexOf("### zed"));
  });

  it("is byte-identical regardless of input order and already canonical", () => {
    const a = stubBridge("abe", fullSkill("A"));
    const z = stubBridge("zed", fullSkill("Z"));
    const md1 = composeSkill([a, z], { name: "s", description: "d" });
    const md2 = composeSkill([z, a], { name: "s", description: "d" });
    expect(md1).toBe(md2);
    expect(md1).toBe(new TextDecoder().decode(writeBytes(md1)));
    expect(md1.endsWith("\n")).toBe(true);
    expect(md1.endsWith("\n\n")).toBe(false);
  });

  it("skips absent or empty sections without blank headings", () => {
    const partial: BridgeSkill = {
      conventions: "only conv",
      imports: "",
      tokens: "  ",
      architecture: "",
      naming: "",
    };
    const md = composeSkill([stubBridge("a", partial), stubBridge("b")], {
      name: "s",
      description: "d",
    });
    expect(md).toContain("## Conventions");
    expect(md).toContain("### a\nonly conv");
    expect(md).not.toContain("## Imports");
    expect(md).not.toContain("## Tokens");
    expect(md).not.toContain("## Naming");
    expect(md).not.toContain("### b");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/skill-template/test/compose.test.ts`
Expected: FAIL — `composeSkill` is not exported / module `../src/index.js` not found.

- [ ] **Step 6: Implement the composer**

Create `packages/skill-template/src/index.ts`:

```ts
import { sortByBytes, writeBytes } from "@boyscout/determinism";
import type { Bridge, BridgeSkill } from "@boyscout/schemas";

/** Metadata for the composed agentskills.io SKILL.md. */
export interface SkillMeta {
  readonly name: string;
  readonly description: string;
}

/** Typed sections in fixed render order: [fragment field, markdown heading]. */
const SECTIONS: ReadonlyArray<readonly [keyof BridgeSkill, string]> = [
  ["conventions", "Conventions"],
  ["imports", "Imports"],
  ["tokens", "Tokens"],
  ["architecture", "Architecture"],
  ["naming", "Naming"],
];

/**
 * Compose selected bridges' typed knowledge fragments into an agentskills.io
 * SKILL.md string. Bridges are sorted by id; sections render in fixed order;
 * within a section each bridge whose fragment has a non-empty value renders one
 * `### <id>` sub-block.
 *
 * ponytail: this is an agent-context artifact, outside the D3a *generation*
 * determinism guarantee (the Skill does not participate in generation). It is
 * byte-stable by construction anyway — sorted bridges, fixed section order, LF
 * joins, single trailing newline — and canonicalized through writeBytes().
 */
export function composeSkill(bridges: readonly Bridge[], meta: SkillMeta): string {
  const ordered = sortByBytes(bridges, (b) => b.id);
  const blocks: string[] = [
    `---\nname: ${meta.name}\ndescription: ${meta.description}\n---`,
  ];

  for (const [field, heading] of SECTIONS) {
    const subs: string[] = [];
    for (const b of ordered) {
      const text = b.skill?.[field]?.trim();
      if (text) subs.push(`### ${b.id}\n${text}`);
    }
    if (subs.length > 0) blocks.push(`## ${heading}\n${subs.join("\n\n")}`);
  }

  return new TextDecoder().decode(writeBytes(blocks.join("\n\n")));
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/skill-template/test/compose.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Typecheck, format, lint**

Run: `pnpm --filter @boyscout/skill-template typecheck && node_modules/.bin/biome format --write packages/skill-template && node_modules/.bin/biome lint packages`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add packages/skill-template pnpm-lock.yaml
git commit -m "feat(sp8a): skill-template composeSkill — byte-stable agentskills.io SKILL.md"
```

---

## Task 3: Bridge Skill fragments + presence contract

**Files:**
- Modify: `packages/bridge-contract-kit/src/index.ts` (add `runSkillContract`)
- Create: `packages/bridges/bridge-astryx-react/src/skill.ts`
- Modify: `packages/bridges/bridge-astryx-react/src/index.ts`
- Create: `packages/bridges/bridge-astryx-react/test/skill-contract.test.ts`
- Create: `packages/bridges/bridge-material/src/skill.ts`
- Modify: `packages/bridges/bridge-material/src/index.ts`
- Create: `packages/bridges/bridge-material/test/skill-contract.test.ts`
- Create: `packages/skill-template/test/real-bridges.test.ts`

**Interfaces:**
- Consumes: `Bridge`, `BridgeSkill` (Task 1); `composeSkill` (Task 2).
- Produces: `runSkillContract(bridge: Bridge, opts: { expectedId: string }): void` (exported from `@boyscout/bridge-contract-kit`); `skill: BridgeSkill` exported from each bridge's `skill.ts` and attached to the exported `bridge`.

- [ ] **Step 1: Write the failing contract helper test wiring (astryx first)**

Create `packages/bridges/bridge-astryx-react/test/skill-contract.test.ts`:

```ts
import { runSkillContract } from "@boyscout/bridge-contract-kit";
import { bridge } from "../src/index.js";

runSkillContract(bridge, { expectedId: "astryx-react" });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/skill-contract.test.ts`
Expected: FAIL — `runSkillContract` is not exported from `@boyscout/bridge-contract-kit`.

- [ ] **Step 3: Add the `runSkillContract` helper**

In `packages/bridge-contract-kit/src/index.ts`, add this exported function (place it after `runRegistryContract`). Note `describe`/`it`/`expect` are already imported at the top of that file:

```ts
/**
 * Skill-fragment contract (SP8a): the bridge exposes a `skill` with all five
 * typed sections present and non-empty (after trim).
 */
export function runSkillContract(bridge: Bridge, opts: { expectedId: string }): void {
  const sections = ["conventions", "imports", "tokens", "architecture", "naming"] as const;
  describe(`${opts.expectedId} skill contract`, () => {
    it("exposes a skill fragment", () => {
      expect(bridge.skill).toBeDefined();
    });
    for (const section of sections) {
      it(`has non-empty ${section}`, () => {
        expect((bridge.skill?.[section] ?? "").trim().length).toBeGreaterThan(0);
      });
    }
  });
}
```

- [ ] **Step 4: Run the astryx contract test — still failing (no fragment yet)**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/skill-contract.test.ts`
Expected: FAIL — `bridge.skill` is undefined.

- [ ] **Step 5: Author the astryx fragment**

Create `packages/bridges/bridge-astryx-react/src/skill.ts`:

```ts
import type { BridgeSkill } from "@boyscout/schemas";

export const skill: BridgeSkill = {
  conventions:
    "Author React components with the Astryx idiom. The generated seam is two files: a disposable scaffold under `.running/` (overwritten every run) and a durable, human-owned logic file under `src/` (created if absent, never overwritten). Regenerating preserves the human file; a typed contract pins the seam so signature drift is a compile error.",
  imports:
    "Import framework primitives from `@astryxdesign/core` and React from `react`. Do not deep-import internal paths — the Registry pins the allowed catalog of node types per capability.",
  tokens:
    "Use Astryx design tokens for spacing, color, and typography. Never hard-code a literal style value that a token already covers.",
  architecture:
    "Capabilities split into declarative (component) and logic-bearing (service, store, http). Declarative capabilities emit standards-conformant structure with typed logic-holes; logic-bearing capabilities scaffold structure only and leave behavior to the durable `src/` file. The preview `<Renderer/>` is authoring-stage infrastructure and never participates in generation.",
  naming:
    "Follow the bridge's naming rules (see naming.ts): PascalCase component identifiers, camelCase props and handlers, and file names that mirror the component identifier.",
};
```

- [ ] **Step 6: Wire the fragment onto the astryx bridge**

In `packages/bridges/bridge-astryx-react/src/index.ts`, add the import beside the other `./` imports:

```ts
import { skill } from "./skill.js";
```

and add `skill` to the exported bridge object:

```ts
export const bridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry,
  postRules: [astryxOnly, biomeLint],
  skill,
};
```

- [ ] **Step 7: Run the astryx contract test — now passing**

Run: `pnpm exec vitest run packages/bridges/bridge-astryx-react/test/skill-contract.test.ts`
Expected: PASS (6 tests: exposes + 5 sections).

- [ ] **Step 8: Author + wire the material fragment and its test**

Create `packages/bridges/bridge-material/src/skill.ts`:

```ts
import type { BridgeSkill } from "@boyscout/schemas";

export const skill: BridgeSkill = {
  conventions:
    "Generate governed Angular with Material Design. Emit standalone components; the generated scaffold under `.running/` is disposable and the durable logic lives in human-owned `src/` files created if absent. The typed seam contract makes signature drift a compile error.",
  imports:
    "Import Angular primitives from `@angular/core` and Material components from `@angular/material/*`. Respect module boundaries — do not import across feature boundaries the Registry does not sanction.",
  tokens:
    "Use the Material theme tokens for color, elevation, and typography. Never hard-code a value that a theme token already provides.",
  architecture:
    "Wire dependencies through Angular DI. Separate presentational components from service/store layers; logic-bearing capabilities (service, store, http-with-transforms) scaffold structure and leave behavior to the durable `src/` layer. Material previews are honest structural wireframes, authoring-stage only.",
  naming:
    "Follow the bridge's naming rules (see naming.ts): PascalCase class identifiers with the Angular suffix convention, camelCase members, and kebab-case selectors and file names.",
};
```

In `packages/bridges/bridge-material/src/index.ts`, add beside the other `./` imports:

```ts
import { skill } from "./skill.js";
```

and add `skill` to the exported bridge object:

```ts
export const bridge: Bridge = {
  id: "material",
  platform: "angular",
  registry,
  postRules: [materialOnly, biomeLint],
  skill,
};
```

Create `packages/bridges/bridge-material/test/skill-contract.test.ts`:

```ts
import { runSkillContract } from "@boyscout/bridge-contract-kit";
import { bridge } from "../src/index.js";

runSkillContract(bridge, { expectedId: "material" });
```

- [ ] **Step 9: Run the material contract test**

Run: `pnpm exec vitest run packages/bridges/bridge-material/test/skill-contract.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 10: Write the real-bridges integration test**

Create `packages/skill-template/test/real-bridges.test.ts`:

```ts
import { bridge as astryx } from "@boyscout/bridge-astryx-react";
import { bridge as material } from "@boyscout/bridge-material";
import { writeBytes } from "@boyscout/determinism";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

describe("composeSkill over the real bridges", () => {
  const meta = { name: "boyscout", description: "governed deterministic generation" };

  it("renders both bridge ids and every section heading", () => {
    const md = composeSkill([astryx, material], meta);
    for (const heading of ["## Conventions", "## Imports", "## Tokens", "## Architecture", "## Naming"]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("### astryx-react");
    expect(md).toContain("### material");
  });

  it("is byte-stable and canonical", () => {
    const md = composeSkill([material, astryx], meta);
    expect(md).toBe(composeSkill([astryx, material], meta));
    expect(md).toBe(new TextDecoder().decode(writeBytes(md)));
  });
});
```

- [ ] **Step 11: Run the integration test**

Run: `pnpm exec vitest run packages/skill-template/test/real-bridges.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 12: Full verification — typecheck, tests, format, lint**

Run:
```bash
pnpm -r typecheck
pnpm exec vitest run packages/skill-template packages/bridges packages/bridge-contract-kit
node_modules/.bin/biome format --write packages
node_modules/.bin/biome lint packages
```
Expected: typecheck PASS all packages; all listed tests PASS; format makes no further changes on a second run; lint clean.

- [ ] **Step 13: Commit**

```bash
git add packages/bridge-contract-kit/src/index.ts packages/bridges packages/skill-template/test/real-bridges.test.ts
git commit -m "feat(sp8a): Bridge Skill fragments on both bridges + presence contract"
```

---

## Self-Review

**Spec coverage:**
- Spec §1 (contract slot) → Task 1. ✓
- Spec §2 (composer: sort by id, fixed section order, per-bridge sub-blocks, skip empty, byte-stable via writeBytes) → Task 2 (implementation + 5 unit tests). ✓
- Spec §3 (fragments on both bridges, all five sections) → Task 3 Steps 5–8. ✓
- Spec §4 (composer unit tests incl. order-independence + empty-skip; fragment presence per bridge) → Task 2 Step 4 + Task 3 (`runSkillContract`, integration). ✓
- Spec "Not in SP8a" (CLI, E2E, lockfile, hardening) → not planned. ✓
- Invariant (Runtime never reads `bridge.skill`) → Global Constraints + no runtime task. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content; every command has expected output. ✓

**Type consistency:** `BridgeSkill` fields (`conventions/imports/tokens/architecture/naming`) match across Tasks 1–3, the `SECTIONS` table, `runSkillContract`, and both fragments. `composeSkill(bridges, meta)` / `SkillMeta { name, description }` used identically in unit + integration tests. Bridge ids (`astryx-react`, `material`) match the real `index.ts` and the `expectedId` args. ✓
