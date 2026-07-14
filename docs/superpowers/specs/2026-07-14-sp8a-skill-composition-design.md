# SP8a — Skill Composition (skill-template + Bridge Skill fragments) — Design

> First slice of SP8 (roadmap capstone). Splits Pillar A — the agent-context **Skill** layer — out of the SP8 bundle (E2E, lockfile, hardening stay in **SP8b**). References architecture decisions in `docs/FIRST-SPEC.md` (glossary §3.1: Skill vs. Bridge Skill) and the v1 roadmap (`docs/V1-ROADMAP.md`).

## Goal / proof-of-done

Both bridges expose typed knowledge fragments; `@boyscout/skill-template` composes any selection of bridges into a **byte-stable agentskills.io `SKILL.md`**; verified by tests. CLI wiring and the full E2E chain are explicitly out of scope (→ SP8b).

## Context

Per FIRST-SPEC §3.1:
- **Skill** — thin agent-layer context. Composes fragments from one or more Bridge Skills, injects them into the agent's context. **Does not execute code, does not participate in generation.**
- **Bridge Skill** — a knowledge fragment inside a Bridge (conventions, imports, tokens, architecture, naming). Consumed by the Skill, **never by the Runtime**.

Current state in the repo:
- The `Bridge` contract (`packages/schemas/src/index.ts`) has `id, platform, registry, postRules` — **no skill slot**.
- **No** Bridge Skill fragments in either bridge; **no** `SKILL.md` anywhere; **no** `@boyscout/skill-template` package.

SP8a builds all three: the contract slot, the composer, and real fragment content for both bridges.

## Design

### 1. Contract change — `packages/schemas`

Add an optional slot to `Bridge`:

```ts
export interface BridgeSkill {
  readonly conventions: string;
  readonly imports: string;
  readonly tokens: string;
  readonly architecture: string;
  readonly naming: string;
}

export interface Bridge {
  readonly id: string;
  readonly platform: string;
  readonly registry: BridgeRegistry;
  readonly postRules: readonly AssetRule[];
  readonly skill?: BridgeSkill; // NEW — consumed only by skill-template, never by Runtime
}
```

- **Optional** so existing test-constructed `Bridge` objects keep compiling; both *real* bridges populate all five sections.
- **Invariant preserved (§14.1 / glossary §3.1):** the Runtime never reads `bridge.skill`. This is behavioral and unchanged — the field is data on the Bridge object that only `skill-template` accesses. No Runtime code path touches it.

### 2. Composer — new package `@boyscout/skill-template`

Single exported function:

```ts
composeSkill(
  bridges: readonly Bridge[],
  meta: { name: string; description: string },
): string
```

- **Order:** bridges sorted by `id` via `sortByBytes` (from `@boyscout/determinism`) → output is independent of caller order.
- **Output** is an agentskills.io `SKILL.md` string:

  ```
  ---
  name: <meta.name>
  description: <meta.description>
  ---
  ## Conventions
  ### bridge-astryx-react
  <text>
  ### bridge-material
  <text>
  ## Imports
  ...
  ```

  Fixed section order: **Conventions → Imports → Tokens → Architecture → Naming**. Each section renders one `### <bridge.id>` sub-block per bridge whose fragment has that section non-empty. A bridge with no `skill`, or with an empty string for a section, is **skipped** for that section (no blank heading emitted).

- **Determinism:** byte-stable *by construction* — sorted bridges, fixed section order, `\n` joins, no ambient input. This is **agent-context, outside the D3a generation-determinism guarantee** (the Skill does not participate in generation), but is deterministic anyway. Marked with a `// ponytail:` comment at the seam.
- **Optional file emit:** a thin `writeSkill(path, md)` wrapper over `writeBytes` for byte-identical on-disk output. Not required by any SP8a consumer; include only if a test needs it, otherwise the string return is the contract.

**Deliberately skipped (YAGNI):** no skill registry/plugin system, no caching, no multi-format output, no baked-in `meta`. One function, one string; the caller (CLI/E2E, SP8b) supplies `meta`.

### 3. Fragment content — author `skill` on both bridges

Populate `skill: BridgeSkill` on `bridge-astryx-react` and `bridge-material`, drawn from conventions the bridges **already encode** (their providers, `naming.ts`, catalog) — real but minimal, not exhaustive documentation:

| Section | bridge-astryx-react | bridge-material |
|---|---|---|
| conventions | Astryx component idioms; seam file split (`.running/` scaffold + `src/` durable logic, D2b/D2d) | Angular standalone components, module boundaries |
| imports | `@astryx/*`, React import style | `@angular/*`, `@angular/material/*` |
| tokens | Astryx design tokens | Material theme tokens |
| architecture | Renderer/preview role; provider tiers (declarative vs. logic-bearing) | Angular DI; service/store layering |
| naming | rules from `naming.ts` | rules from `naming.ts` |

The prose is bridge-author-owned. SP8a tests the **mechanism** (composition + byte-stability), not the prose quality.

### 4. Tests

- **Composer unit** (`skill-template`):
  - frontmatter (`name`, `description`) emitted correctly;
  - fixed section order;
  - two-bridge merge groups sub-blocks by section;
  - **byte-identical across two runs** and **independent of input order** (pass bridges reversed → same output);
  - empty/absent section is skipped (no blank heading).
- **Fragment presence** (one assertion per bridge, or a shared contract helper): each real bridge exposes `skill` with all five sections non-empty.

## Not in SP8a (deferred to SP8b)

- `boyscout skill` CLI command wiring.
- Full agent → CLI → browser → approval → generate E2E chain (D5/D9).
- `boyscout.lock` transitive-closure lockfile (D3b).
- Matured cross-OS golden + §21 hardening checklist gate.

## Conventions (repo — carry into the plan)

- Tests: `pnpm exec vitest run <path>`. Typecheck: `pnpm --filter <pkg> typecheck` / `pnpm -r typecheck`.
- Lint: `node_modules/.bin/biome lint packages apps`. Format: `node_modules/.bin/biome format packages apps` — **run `format` before commit** (SP7 CI failed on format-check drift when only `lint` was run locally).
- ESM, `type: module`, packages export `./src/index.ts` directly — no build step. Strict TS (`import type`/inline `type`, `.js` relative specifiers on `.ts` source, conditional-spread for optional props, guards/casts for index access).
