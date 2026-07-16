# Skill-naming inversion + CLI library swap — v0.1.0-alpha.3

**Date:** 2026-07-16
**Status:** Approved for planning
**Version target:** `0.1.0-alpha.3`

## Problem

Two issues in what `boyscout init` scaffolds:

1. **The skill names are inverted.** The *bridge-conventions* skill (how generated
   code should look) is written to a skill dir named `boyscout` — the product's
   name, attached to reference material. The *workflow/driver* skill (how to
   actually use BoyScout) is named `boyscout-workflow` and its description ("How to
   drive the BoyScout CLI…") reads like internal docs, not an invocation trigger.

   The workflow skill *is* the product's main, agent-facing skill and should own the
   `boyscout` name. The bridge conventions are a **reference** the main skill
   consults — they should not be an independently triggerable skill at all.

2. **The main skill's description doesn't match user intent.** It needs to make clear
   the skill fires when a user wants to generate, diagram, design, or build a screen,
   feature, component, form, or transaction involving the frontend or UI.

Separately, the CLI hand-rolls argument parsing (`flag()` / `argv.indexOf`) and
prompting (`node:readline/promises`). The project standardizes on `commander` for
command/option parsing and `@clack/prompts` for interactive prompts.

## Non-goals (YAGNI)

- No change to `generate` / `author` runtime behavior, the spec/config schema, the
  bridges, or the demo seed.
- No migration logic for projects scaffolded on alpha.2. `init` is create-if-absent;
  re-running it won't overwrite or clean up the old `boyscout/` (conventions) and
  `boyscout-workflow/` dirs. This is an alpha; the breaking layout change is noted in
  the PR, not automated.
- The `workflow-skill.ts` *file* is not renamed — its job (build the driver body) is
  unchanged; only the emitted `name`/`description` change.

## Design

### 1. Skill naming inversion

`workflow-skill.ts` becomes the product's main skill:

- `name: "boyscout"`
- `description`:

  > Use when generating, designing, diagramming, or building any frontend/UI screen,
  > component, feature, form, or transaction — BoyScout turns a declarative spec into
  > governed, byte-deterministic React/Angular code. Trigger on "build a screen",
  > "create a component", "add a feature", "design a form/flow", or any UI/frontend
  > codegen. You author the spec; the Runtime emits the code.

The bridge conventions (`composeSkill([bridge], …)` output, frontmatter stripped)
become a **bundled reference**, not a skill.

### 2. Per-agent layout

`skillFiles` in `agent-targets.ts` is reshaped from taking a list of co-equal
`AgentSkill`s to taking one `main: AgentSkill` plus one `reference` block
(`{ bodyMarkdown }`). Agent-specific assembly:

- **claude:** two files under one dir —
  - `boyscout/SKILL.md` — main skill (frontmatter + workflow body + an appended
    `## Bridge conventions` pointer line instructing the agent to read
    `reference/bridge-conventions.md` before authoring any feature tree).
  - `boyscout/reference/bridge-conventions.md` — the composed conventions (plain
    markdown, no skill frontmatter). Co-located so global scope
    (`~/.claude/skills/boyscout/`) keeps both together.

  The agent's skill list shows exactly one `boyscout` skill; the reference is only
  read when the main skill points to it.

- **cursor:** single `.cursor/rules/boyscout.mdc` (`alwaysApply: true`) — workflow
  body plus conventions folded in as a `## Bridge conventions` section. Cursor rules
  are ambient, not invokable, so there is no separate-trigger concern.

- **generic:** single `AGENTS.md` — `## boyscout` section (workflow) plus a
  `## Bridge conventions` subsection.

The claude-vs-inline branching (pointer line + separate file for claude; inlined body
for cursor/generic) lives in `skillFiles`, keeping `workflowSkill` agent-agnostic.

### 3. `init.ts` wiring

- Build `main = workflowSkill({ stack, bridgeId, platform, capabilities })`.
- Build `reference = { bodyMarkdown: stripFrontmatter(composeSkill([bridge], meta)) }`
  (the `meta` only fed the stripped frontmatter, so it is nominal).
- Call `skillFiles(root, agent, scope, main, reference)`.
- Remove `SKILL_META` as the conventions skill's name/description.

### 4. `commander` for commands (`main.ts`)

Replace hand-rolled routing with a commander `program`:

- Subcommands `init`, `generate`, `author`, each with typed options
  (`.choices()` validating `--stack` / `--agent` / `--scope`); `--version` and
  `--help` come for free.
- `.exitOverride()` so parsing errors / help / version throw instead of calling
  `process.exit`. `main(argv): Promise<number>` still **returns** an exit code
  (captured from action handlers into an outer variable; commander errors mapped to
  `err.exitCode ?? 1`, with help/version → 0). This preserves the existing
  `main.test.ts` / `version.test.ts` contract that `main([...])` returns a code.
- `selectBridge` stays exported (used by `bridge-selection.test.ts`).
- `bin.ts` keeps its author-stays-alive logic unchanged.

### 5. `@clack/prompts` for interaction (`init-prompts.ts`)

Replace the readline `createInterface` / `choose` / `chooseCapabilities` with clack
`select` / `multiselect` / `isCancel` (cancel → clean exit). Because commander now
parses flags, `resolveInitOptions` takes a **parsed-options object** (fields possibly
undefined) plus deps, and only fills gaps: prompts on a real TTY without `--yes`,
defaults otherwise. Non-TTY never blocks on stdin (safe under `npx` pipes and tests).

### 6. Version + deps

- `apps/cli/package.json`: `version` → `0.1.0-alpha.3`; add `commander` and
  `@clack/prompts` to `dependencies` (both pure JS, bundle cleanly via esbuild).

## Test impact

- **`init.test.ts`** — updated for the new layout: main skill at `boyscout/SKILL.md`
  asserting `name: "boyscout"` and a trigger-phrase in the description; conventions at
  `boyscout/reference/bridge-conventions.md`; cursor single `boyscout.mdc`; generic
  `AGENTS.md` with `## boyscout` + `## Bridge conventions`; adjusted created/skipped
  lists.
- **`init-prompts.test.ts`** — updated to the parsed-options signature.
- **`main.test.ts`** — updated for commander's error/usage output (assert exit codes).
- **`version.test.ts`**, **`bridge-selection.test.ts`** — unaffected.

## Files touched

| File | Change |
|------|--------|
| `apps/cli/package.json` | version bump; add `commander`, `@clack/prompts` |
| `apps/cli/src/workflow-skill.ts` | emit `name: "boyscout"` + trigger description |
| `apps/cli/src/agent-targets.ts` | `skillFiles(main, reference)` reshape; per-agent assembly |
| `apps/cli/src/init.ts` | build main + reference; drop conventions-as-skill naming |
| `apps/cli/src/main.ts` | commander program with `.exitOverride()`; extract generate action |
| `apps/cli/src/init-prompts.ts` | clack prompts; parsed-options `resolveInitOptions` |
| `apps/cli/test/init.test.ts` | new layout assertions |
| `apps/cli/test/init-prompts.test.ts` | parsed-options signature |
| `apps/cli/test/main.test.ts` | commander error/usage output |
