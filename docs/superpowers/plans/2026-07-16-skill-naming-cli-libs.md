# Skill-naming inversion + CLI library swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workflow skill the product's main `boyscout` skill with an intent-matching description, demote bridge conventions to a bundled reference, and swap the CLI to `commander` + `@clack/prompts`, released as `v0.1.0-alpha.3`.

**Architecture:** `init` scaffolds one main skill (`boyscout`, from `workflowSkill`) plus a plain reference file (`reference/bridge-conventions.md`, from `composeSkill`) that the main skill points to — no second triggerable skill. `agent-targets.ts` owns the per-agent layout (two files for Claude; one inlined file for Cursor/generic). `main.ts` routes commands through a `commander` program with `.exitOverride()` so `main(argv)` still returns an exit code; `init-prompts.ts` fills option gaps with `@clack/prompts` on a real TTY.

**Tech Stack:** TypeScript (ESM, Node ≥20), pnpm workspace, esbuild bundle (third-party kept external), vitest, `commander`, `@clack/prompts`.

## Global Constraints

- **Version:** `apps/cli/package.json` `version` MUST be `0.1.0-alpha.3`.
- **Build invariant (E3):** every third-party dependency stays *external* in `apps/cli/build.mjs` and is declared in `apps/cli/package.json` `dependencies`. New deps `commander` and `@clack/prompts` MUST be added to both the `external` array and `dependencies`.
- **`main(argv)` contract:** returns `number` synchronously for `generate`/`author`; returns `Promise<number>` for `init`. Do not make the whole function async (existing sync-style tests depend on the `generate` path returning a number).
- **create-if-absent (D2b):** `init` never overwrites an existing file.
- **Main skill name:** exactly `boyscout`. Reference file path within the skill dir: `reference/bridge-conventions.md`.
- **Main skill description (verbatim):**
  `Use when generating, designing, diagramming, or building any frontend/UI screen, component, feature, form, or transaction — BoyScout turns a declarative spec into governed, byte-deterministic React/Angular code. Trigger on "build a screen", "create a component", "add a feature", "design a form/flow", or any UI/frontend codegen. You author the spec; the Runtime emits the code.`

---

### Task 1: Add CLI deps, bump version, keep the build hermetic

**Files:**
- Modify: `apps/cli/package.json` (version + dependencies)
- Modify: `apps/cli/build.mjs` (external allowlist)

**Interfaces:**
- Produces: `commander` (`Command`, `Option`) and `@clack/prompts` (`select`, `multiselect`, `isCancel`, `cancel`) importable from the CLI package; version string `0.1.0-alpha.3` readable via `../package.json`.

- [ ] **Step 1: Install the two dependencies (exact pins, into the CLI package)**

Run from the repo root:

```bash
pnpm --filter @boyscoutdev/cli add -E commander @clack/prompts
```

Expected: `apps/cli/package.json` gains both under `dependencies` with exact versions; `pnpm-lock.yaml` updates; install succeeds.

- [ ] **Step 2: Bump the CLI version**

In `apps/cli/package.json` change:

```json
  "version": "0.1.0-alpha.2",
```

to:

```json
  "version": "0.1.0-alpha.3",
```

- [ ] **Step 3: Keep the new deps external in the bundle**

In `apps/cli/build.mjs`, add both to the `external` array (alphabetical-ish, keep it readable):

```js
const external = [
  "@astryxdesign/core",
  "@biomejs/js-api",
  "@biomejs/wasm-nodejs",
  "@clack/prompts",
  "@hono/node-server",
  "commander",
  "eta",
  "hono",
  "typescript",
  "yaml",
  "zod",
];
```

- [ ] **Step 4: Verify install + build**

Run:

```bash
pnpm install && pnpm --filter @boyscoutdev/cli build
```

Expected: build completes; `apps/cli/dist/bin.js` is produced. (No behavior change yet — the deps are unused until later tasks.)

- [ ] **Step 5: Commit**

```bash
git add apps/cli/package.json apps/cli/build.mjs pnpm-lock.yaml
git commit -m "chore(cli): add commander + @clack/prompts, bump to v0.1.0-alpha.3"
```

---

### Task 2: Invert skill naming and bundle conventions as a reference

**Files:**
- Modify: `apps/cli/src/workflow-skill.ts` (emit `name: "boyscout"` + the new description)
- Modify: `apps/cli/src/agent-targets.ts` (reshape `skillFiles` to take one main skill + one reference; add `SkillReference`)
- Modify: `apps/cli/src/init.ts` (build main + reference, call the new `skillFiles`; drop conventions-as-skill naming)
- Test: `apps/cli/test/init.test.ts` (rewrite layout assertions)

**Interfaces:**
- Consumes: `workflowSkill(ctx): AgentSkill` (name now `boyscout`), `composeSkill(bridges, meta): string`, `stripFrontmatter(md): string`.
- Produces:
  - `skillFiles(root: string, agent: Agent, scope: Scope, main: AgentSkill, reference: SkillReference): OutFile[]`
  - `interface SkillReference { readonly bodyMarkdown: string }`
  - Claude layout: `boyscout/SKILL.md` (frontmatter `name: "boyscout"` + body + a `## Bridge conventions` pointer to `reference/bridge-conventions.md`) followed by `boyscout/reference/bridge-conventions.md`, in that array order.
  - Cursor layout: single `boyscout.mdc` with conventions inlined under `## Bridge conventions`.
  - Generic layout: single `AGENTS.md` with `## boyscout` + `## Bridge conventions`.

- [ ] **Step 1: Rewrite `init.test.ts` for the new layout (failing test)**

Replace the whole file `apps/cli/test/init.test.ts` with:

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_INIT_OPTIONS, init, type InitOptions } from "../src/init.js";
import { main } from "../src/main.js";

const MAIN_SKILL = join(".claude", "skills", "boyscout", "SKILL.md");
const REFERENCE = join(".claude", "skills", "boyscout", "reference", "bridge-conventions.md");

function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), "bs-init-"));
}

function opts(over: Partial<InitOptions> = {}): InitOptions {
  return { ...DEFAULT_INIT_OPTIONS, ...over };
}

describe("boyscout init", () => {
  it("creates config, an empty seed spec, the main skill, and the bundled reference", () => {
    const dir = emptyProject();
    const result = init(dir, opts());

    expect(result.created).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      MAIN_SKILL,
      REFERENCE,
    ]);
    expect(result.skipped).toEqual([]);

    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.features).toEqual([]);
    expect(spec.metadata).toMatchObject({ bridge: "astryx-react", platform: "react" });
  });

  it("the main skill is the product skill; conventions are a bundled reference it points to", () => {
    const dir = emptyProject();
    init(dir, opts());

    const skill = readFileSync(join(dir, MAIN_SKILL), "utf8");
    expect(skill).toContain('name: "boyscout"');
    expect(skill).toContain("boyscout generate");
    expect(skill).toContain("reference/bridge-conventions.md");

    const reference = readFileSync(join(dir, REFERENCE), "utf8");
    expect(reference).toContain("### astryx-react");
  });

  it("angular stack selects the Material bridge in config and spec metadata", () => {
    const dir = emptyProject();
    init(dir, opts({ stack: "angular" }));

    const config = readFileSync(join(dir, "boyscout.config.yaml"), "utf8");
    expect(config).toContain("bridge: material");
    expect(config).toContain("platform: angular");

    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.metadata).toMatchObject({ bridge: "material", platform: "angular" });
  });

  it("honors an explicit capability subset", () => {
    const dir = emptyProject();
    init(dir, opts({ capabilities: ["component"] }));
    const config = readFileSync(join(dir, "boyscout.config.yaml"), "utf8");
    expect(config).toContain("  - component");
    expect(config).not.toContain("  - service");
  });

  it("cursor writes a single .mdc rule with conventions inlined; generic writes AGENTS.md", () => {
    const cursorDir = emptyProject();
    const cursor = init(cursorDir, opts({ agent: "cursor" }));
    expect(cursor.created).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      join(".cursor", "rules", "boyscout.mdc"),
    ]);
    const mdc = readFileSync(join(cursorDir, ".cursor", "rules", "boyscout.mdc"), "utf8");
    expect(mdc).toContain("## Bridge conventions");
    expect(mdc).toContain("### astryx-react");

    const genericDir = emptyProject();
    const generic = init(genericDir, opts({ agent: "generic" }));
    expect(generic.created).toContain("AGENTS.md");
    const agents = readFileSync(join(genericDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## boyscout");
    expect(agents).toContain("## Bridge conventions");
  });

  it("--example seeds the demo spec (React only)", () => {
    const dir = emptyProject();
    init(dir, opts({ example: true }));
    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.features.map((f: { id: string }) => f.id)).toEqual(["user-card", "user-service"]);
  });

  it("never overwrites an existing file (create-if-absent, D2b)", () => {
    const dir = emptyProject();
    writeFileSync(join(dir, "boyscout.config.yaml"), "platform: mine\n");

    const result = init(dir, opts());

    expect(result.skipped).toEqual(["boyscout.config.yaml"]);
    expect(result.created).toEqual(["boyscout-spec.json", MAIN_SKILL, REFERENCE]);
    expect(readFileSync(join(dir, "boyscout.config.yaml"), "utf8")).toBe("platform: mine\n");
  });

  it("is idempotent — a second run creates nothing", () => {
    const dir = emptyProject();
    init(dir, opts());
    const second = init(dir, opts());
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      MAIN_SKILL,
      REFERENCE,
    ]);
  });

  it("--example seeds a project that generates the logic-bearing seam", () => {
    const dir = emptyProject();
    init(dir, opts({ example: true }));
    const genArgs = [
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ];
    expect(main(genArgs)).toBe(0);

    const runningService = join(dir, ".running", "services", "UserService.ts");
    const durableService = join(dir, "src", "services", "user-service.ts");
    expect(existsSync(runningService)).toBe(true);
    expect(existsSync(durableService)).toBe(true);

    const sentinel = "// hand-authored logic — must survive regeneration\n";
    writeFileSync(durableService, sentinel);
    expect(main(genArgs)).toBe(0);
    expect(readFileSync(durableService, "utf8")).toBe(sentinel);
  });

  it("an empty default spec still generates (emits only the lock)", () => {
    const dir = emptyProject();
    init(dir, opts());
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, "boyscout.lock"))).toBe(true);
  });

  it("main routes the init command (non-TTY: defaults, no prompt) and exits 0", async () => {
    const dir = emptyProject();
    expect(await main(["init", "--root", dir])).toBe(0);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
    expect(existsSync(join(dir, MAIN_SKILL))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:

```bash
pnpm vitest run apps/cli/test/init.test.ts
```

Expected: FAIL (current code writes `boyscout` conventions + `boyscout-workflow`, so `created` arrays and `name: "boyscout"` on the *main* skill won't match).

- [ ] **Step 3: Rename the main skill in `workflow-skill.ts`**

In `apps/cli/src/workflow-skill.ts`, change only the returned object at the end of `workflowSkill`:

```ts
  return {
    name: "boyscout",
    description:
      'Use when generating, designing, diagramming, or building any frontend/UI screen, component, feature, form, or transaction — BoyScout turns a declarative spec into governed, byte-deterministic React/Angular code. Trigger on "build a screen", "create a component", "add a feature", "design a form/flow", or any UI/frontend codegen. You author the spec; the Runtime emits the code.',
    bodyMarkdown,
  };
```

(Leave `WorkflowContext` and the `bodyMarkdown` template unchanged.)

- [ ] **Step 4: Reshape `skillFiles` in `agent-targets.ts`**

In `apps/cli/src/agent-targets.ts`, add the `SkillReference` interface after `AgentSkill`:

```ts
/** The bundled bridge-conventions reference the main skill points to (no frontmatter). */
export interface SkillReference {
  readonly bodyMarkdown: string;
}
```

Then replace the entire `skillFiles` function with:

```ts
/**
 * Map the one main skill + its bundled conventions reference to the files a given agent reads.
 *
 * Claude gets a real skill dir (`<name>/SKILL.md`) plus a plain `reference/bridge-conventions.md`
 * the skill body points to — the reference is never an independently triggerable skill. Cursor and
 * the generic `AGENTS.md` have no on-demand reference mechanism, so conventions are inlined under a
 * `## Bridge conventions` heading. `global` scope only affects Claude (`~/.claude/skills`).
 */
export function skillFiles(
  root: string,
  agent: Agent,
  scope: Scope,
  main: AgentSkill,
  reference: SkillReference,
): OutFile[] {
  const heading = "## Bridge conventions";
  switch (agent) {
    case "claude": {
      const base =
        scope === "global" ? join(homedir(), ".claude", "skills") : join(root, ".claude", "skills");
      const dir = join(base, main.name);
      const pointer = `${heading}\nGenerated code must follow this project's bridge conventions. Read \`reference/bridge-conventions.md\` before writing any feature tree.`;
      return [
        {
          abs: join(dir, "SKILL.md"),
          content: `---\nname: ${yamlString(main.name)}\ndescription: ${yamlString(main.description)}\n---\n\n${main.bodyMarkdown}\n\n${pointer}`,
        },
        {
          abs: join(dir, "reference", "bridge-conventions.md"),
          content: `# Bridge conventions\n\n${reference.bodyMarkdown}`,
        },
      ];
    }
    case "cursor":
      return [
        {
          abs: join(root, ".cursor", "rules", `${main.name}.mdc`),
          content: `---\ndescription: ${yamlString(main.description)}\nalwaysApply: true\n---\n\n${main.bodyMarkdown}\n\n${heading}\n\n${reference.bodyMarkdown}`,
        },
      ];
    case "generic":
      return [
        {
          abs: join(root, "AGENTS.md"),
          content: `# BoyScout — agent guide\n\n## ${main.name}\n\n${main.bodyMarkdown.trim()}\n\n${heading}\n\n${reference.bodyMarkdown.trim()}\n`,
        },
      ];
  }
}
```

(`yamlString`, `stripFrontmatter`, `OutFile`, `AgentSkill`, `Agent`, `Scope` are unchanged.)

- [ ] **Step 5: Build main + reference in `init.ts`**

In `apps/cli/src/init.ts`:

Change the agent-targets import line to drop `AgentSkill` (no longer referenced) and keep the rest:

```ts
import {
  type Agent,
  type OutFile,
  type Scope,
  skillFiles,
  stripFrontmatter,
} from "./agent-targets.js";
```

Replace the `SKILL_META` constant with a nominal reference meta:

```ts
/** Nominal meta for composeSkill — only feeds the frontmatter, which is stripped for the reference body. */
const REFERENCE_META = {
  name: "bridge-conventions",
  description: "BoyScout bridge conventions.",
};
```

In `init(...)`, replace the `conventions` / `workflow` construction and the `files` array with:

```ts
  const mainSkill = workflowSkill({
    stack: opts.stack,
    bridgeId: bridge.id,
    platform: bridge.platform,
    capabilities,
  });
  const reference = {
    bodyMarkdown: stripFrontmatter(composeSkill([bridge], REFERENCE_META)),
  };

  const files: OutFile[] = [
    { abs: join(root, "boyscout.config.yaml"), content: configYaml(bridge, capabilities) },
    { abs: join(root, "boyscout-spec.json"), content: canonicalJson(spec) },
    ...skillFiles(root, opts.agent, opts.scope, mainSkill, reference),
  ];
```

(Leave `initCommand` for Task 3. Keep `composeSkill` and `workflowSkill` imports.)

- [ ] **Step 6: Run the test to confirm it passes**

Run:

```bash
pnpm vitest run apps/cli/test/init.test.ts
```

Expected: PASS.

- [ ] **Step 7: Typecheck the package**

Run:

```bash
pnpm --filter @boyscoutdev/cli typecheck
```

Expected: no errors. (If `AgentSkill` is reported unused anywhere else, remove that import too.)

- [ ] **Step 8: Commit**

```bash
git add apps/cli/src/workflow-skill.ts apps/cli/src/agent-targets.ts apps/cli/src/init.ts apps/cli/test/init.test.ts
git commit -m "feat(cli): make boyscout the main skill; bundle bridge conventions as a reference"
```

---

### Task 3: Swap the CLI layer to commander + @clack/prompts

**Files:**
- Modify: `apps/cli/src/init-prompts.ts` (clack prompts; `resolveInitOptions` takes parsed options)
- Modify: `apps/cli/src/init.ts` (`initCommand` takes the parsed options object)
- Modify: `apps/cli/src/main.ts` (commander program; extract `generateAction`)
- Verify (no change expected): `apps/cli/src/bin.ts`
- Test: `apps/cli/test/init-prompts.test.ts` (rewrite to object input), `apps/cli/test/main.test.ts` (add unknown-command + invalid-choice assertions)

**Interfaces:**
- Produces:
  - `interface InitCliOptions { root?: string; stack?: Stack; agent?: Agent; scope?: Scope; capabilities?: string; example?: boolean; yes?: boolean }` (exported from `init-prompts.ts`)
  - `resolveInitOptions(cli: InitCliOptions, deps?: { isTty?: boolean }): Promise<InitOptions>`
  - `initCommand(cli: InitCliOptions): Promise<number>` (exported from `init.ts`)
  - `main(argv: string[]): number | Promise<number>` (unchanged signature; commander-backed)
  - `selectBridge(id: string): Bridge | undefined` (unchanged, still exported)
- Consumes: commander `Command`/`Option`; clack `select`/`multiselect`/`isCancel`/`cancel`; `capabilitiesFor(stack)`, `bridgeFor` via `init.ts`.

- [ ] **Step 1: Rewrite `init-prompts.test.ts` for the parsed-options signature (failing test)**

Replace the whole file `apps/cli/test/init-prompts.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { resolveInitOptions } from "../src/init-prompts.js";

describe("resolveInitOptions", () => {
  it("returns defaults when nothing is set and there is no TTY (never blocks on stdin)", async () => {
    const o = await resolveInitOptions({}, { isTty: false });
    expect(o).toEqual({
      stack: "react",
      agent: "claude",
      scope: "local",
      capabilities: [],
      example: false,
    });
  });

  it("reads parsed flags without prompting", async () => {
    const o = await resolveInitOptions(
      {
        stack: "angular",
        agent: "cursor",
        scope: "global",
        capabilities: "component,http",
        example: true,
      },
      { isTty: false },
    );
    expect(o).toEqual({
      stack: "angular",
      agent: "cursor",
      scope: "global",
      capabilities: ["component", "http"],
      example: true,
    });
  });

  it("--yes on a TTY takes defaults without prompting (never opens stdin)", async () => {
    const o = await resolveInitOptions({ yes: true }, { isTty: true });
    expect(o.stack).toBe("react");
    expect(o.agent).toBe("claude");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:

```bash
pnpm vitest run apps/cli/test/init-prompts.test.ts
```

Expected: FAIL — current `resolveInitOptions` takes `(argv, deps)` and calls `.includes`/`.indexOf` on the first arg, so passing an object throws.

- [ ] **Step 3: Replace `init-prompts.ts` with the clack + parsed-options version**

Replace the whole file `apps/cli/src/init-prompts.ts` with:

```ts
import { cancel, isCancel, multiselect, select } from "@clack/prompts";
import type { Agent, Scope } from "./agent-targets.js";
import { capabilitiesFor, type Stack } from "./bridges-map.js";
import type { InitOptions } from "./init.js";

/** Parsed `init` flags from commander; every field optional — prompts/defaults fill the gaps. */
export interface InitCliOptions {
  readonly root?: string;
  readonly stack?: Stack;
  readonly agent?: Agent;
  readonly scope?: Scope;
  /** Comma-separated capability subset as commander hands it over; blank/undefined = all. */
  readonly capabilities?: string;
  readonly example?: boolean;
  readonly yes?: boolean;
}

export interface ResolveDeps {
  readonly isTty?: boolean;
}

/** clack returns a cancel symbol when the user hits CTRL+C; exit cleanly rather than proceed. */
function bail<T>(v: T | symbol): T {
  if (isCancel(v)) {
    cancel("init cancelled");
    process.exit(0);
  }
  return v as T;
}

async function promptStack(): Promise<Stack> {
  return bail(
    await select({
      message: "Stack",
      initialValue: "react",
      options: [
        { value: "react", label: "react" },
        { value: "angular", label: "angular" },
      ],
    }),
  ) as Stack;
}

async function promptAgent(): Promise<Agent> {
  return bail(
    await select({
      message: "Coding agent",
      initialValue: "claude",
      options: [
        { value: "claude", label: "claude" },
        { value: "cursor", label: "cursor" },
        { value: "generic", label: "generic" },
      ],
    }),
  ) as Agent;
}

async function promptScope(): Promise<Scope> {
  return bail(
    await select({
      message: "Scope",
      initialValue: "local",
      options: [
        { value: "local", label: "local" },
        { value: "global", label: "global" },
      ],
    }),
  ) as Scope;
}

/** Empty selection means "all of the stack's bridge capabilities" (init core reads `[]` as all). */
async function promptCapabilities(stack: Stack): Promise<string[]> {
  const all = capabilitiesFor(stack);
  return bail(
    await multiselect({
      message: "Capabilities (select none for all)",
      required: false,
      options: all.map((c) => ({ value: c, label: c })),
    }),
  ) as string[];
}

/**
 * Resolve full InitOptions from commander-parsed flags, filling gaps with interactive prompts on a
 * real TTY (unless `--yes`) and with defaults otherwise. Never blocks on stdin off a TTY — safe
 * under `npx` pipes and in tests. `capabilities: []` means "all of the stack's bridge capabilities".
 */
export async function resolveInitOptions(
  cli: InitCliOptions,
  deps: ResolveDeps = {},
): Promise<InitOptions> {
  const isTty = deps.isTty ?? Boolean(process.stdin.isTTY);
  const skipPrompts = Boolean(cli.yes);

  let stack = cli.stack;
  let agent = cli.agent;
  let scope = cli.scope;
  let capabilities = cli.capabilities
    ? cli.capabilities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (isTty && !skipPrompts) {
    if (!stack) stack = await promptStack();
    if (!agent) agent = await promptAgent();
    if (!capabilities) capabilities = await promptCapabilities(stack);
    if (!scope) scope = await promptScope();
  }

  return {
    stack: stack ?? "react",
    agent: agent ?? "claude",
    scope: scope ?? "local",
    capabilities: capabilities ?? [],
    example: Boolean(cli.example),
  };
}
```

- [ ] **Step 4: Run the prompts test to confirm it passes**

Run:

```bash
pnpm vitest run apps/cli/test/init-prompts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update `initCommand` in `init.ts` to take the parsed options**

In `apps/cli/src/init.ts`, change the import of the prompts module to pull in the new type:

```ts
import { type InitCliOptions, resolveInitOptions } from "./init-prompts.js";
```

Replace the entire `initCommand` function (currently `async function initCommand(argv: string[])`) with:

```ts
/** Run `init` from commander-parsed options; prompts fill any gaps on a TTY. Returns an exit code. */
export async function initCommand(cli: InitCliOptions): Promise<number> {
  const root = cli.root ?? ".";
  let opts: InitOptions;
  try {
    opts = await resolveInitOptions(cli, { isTty: Boolean(process.stdin.isTTY) });
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  if (opts.example && opts.stack !== "react") {
    process.stdout.write("note: --example is React/Astryx only; wrote an empty spec instead\n");
  }
  if (opts.scope === "global" && opts.agent !== "claude") {
    process.stdout.write(
      `note: global scope only applies to Claude Code; wrote ${opts.agent} files project-local\n`,
    );
  }

  const { created, skipped } = init(root, opts);
  for (const rel of created) process.stdout.write(`created ${rel}\n`);
  for (const rel of skipped) process.stdout.write(`exists, skipped ${rel}\n`);
  return 0;
}
```

- [ ] **Step 6: Add the unknown-command + invalid-choice assertions to `main.test.ts` (failing test)**

In `apps/cli/test/main.test.ts`, append inside the `describe("boyscout generate (main)", ...)` block (or add a new `describe`) these two tests:

```ts
  it("returns 1 for an unknown command", async () => {
    expect(await main(["frobnicate"])).toBe(1);
  });

  it("returns 1 when an init enum flag is not an allowed choice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boyscout-cli-"));
    expect(await main(["init", "--root", dir, "--stack", "svelte"])).toBe(1);
  });
```

(`mkdtempSync`, `tmpdir`, `join` are already imported in this file.)

- [ ] **Step 7: Run to confirm the new assertions fail**

Run:

```bash
pnpm vitest run apps/cli/test/main.test.ts
```

Expected: the two new tests FAIL (current `main` prints a custom "unknown command" usage and has no `--stack` validation); the existing two generate tests still PASS.

- [ ] **Step 8: Rewrite `main.ts` to route through commander**

Replace the whole file `apps/cli/src/main.ts` with:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "@boyscout/lockfile";
import { GateError, generate, loadConfig } from "@boyscout/runtime";
import { Specification } from "@boyscout/schemas";
import type { Bridge } from "@boyscout/schemas";
import { Command, Option } from "commander";
import { authorCommand } from "./author/command.js";
import { initCommand } from "./init.js";
import type { InitCliOptions } from "./init-prompts.js";

// The published CLI bundles @boyscout/runtime, so that package is not resolvable at runtime.
// `../package.json` resolves from both src/main.ts (dev) and dist/bin.js (published); in a
// bundled distribution the CLI version *is* the runtime version.
const runtimeVersion = (createRequire(import.meta.url)("../package.json") as { version: string })
  .version;

const BRIDGES: Record<string, Bridge> = {
  "astryx-react": astryxBridge,
  material: materialBridge,
};

/** Resolve a bridge by its config id. Unknown id -> undefined. */
export function selectBridge(id: string): Bridge | undefined {
  return BRIDGES[id];
}

/** Run `generate`; returns an exit code. Extracted so the commander action stays a one-liner. */
function generateAction(specPath: string, configPath: string, check: boolean): number {
  try {
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
    for (const path of emitted) process.stdout.write(`${path}\n`);
    for (const path of preserved) process.stdout.write(`preserved: ${path}\n`);

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
    return 0;
  } catch (err) {
    if (err instanceof GateError) {
      process.stderr.write(
        `422 gate failed:\n${err.violations.map((v) => `  - ${v}`).join("\n")}\n`,
      );
    } else {
      process.stderr.write(`error: ${(err as Error).message}\n`);
    }
    return 1;
  }
}

/**
 * Route the CLI. `generate`/`author` run synchronously and return a number; `init` may prompt and
 * returns a Promise. commander parses with `.exitOverride()` so parse errors / --help / --version
 * throw instead of calling process.exit — keeping `main` a pure function that yields an exit code.
 */
export function main(argv: string[]): number | Promise<number> {
  let exitCode = 0;
  let pending: Promise<number> | undefined;

  const program = new Command();
  program
    .name("boyscout")
    .description("Governed deterministic runtime for software generation")
    .version(runtimeVersion)
    .exitOverride();

  program
    .command("generate")
    .description("generate code from the spec and write boyscout.lock")
    .option("--spec <path>", "spec file path", "./boyscout-spec.json")
    .option("--config <path>", "config file path", "./boyscout.config.yaml")
    .option("--check", "fail if output drifts from boyscout.lock", false)
    .action((opts: { spec: string; config: string; check: boolean }) => {
      exitCode = generateAction(opts.spec, opts.config, opts.check);
    });

  program
    .command("author")
    .description("start the local browser authoring loop")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action(() => {
      // author keeps its own flag parsing; forward everything after the command verbatim.
      exitCode = authorCommand(argv.slice(1));
    });

  const initCmd = program
    .command("init")
    .description("scaffold config, spec, and the boyscout skill (safe to re-run)")
    .option("--root <dir>", "target directory", ".")
    .option("--capabilities <list>", "comma-separated capability subset")
    .option("--example", "seed the demo spec (React/Astryx only)", false)
    .option("--yes", "accept defaults without prompting", false);
  initCmd.addOption(new Option("--stack <stack>", "tech stack").choices(["react", "angular"]));
  initCmd.addOption(
    new Option("--agent <agent>", "coding agent").choices(["claude", "cursor", "generic"]),
  );
  initCmd.addOption(
    new Option("--scope <scope>", "where to write agent skills").choices(["local", "global"]),
  );
  initCmd.action((opts: InitCliOptions) => {
    pending = initCommand(opts);
  });

  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    // exitOverride throws CommanderError; help/version carry exitCode 0, parse errors 1.
    return (err as { exitCode?: number }).exitCode ?? 1;
  }
  return pending ?? exitCode;
}
```

- [ ] **Step 9: Confirm `bin.ts` still works unchanged**

Read `apps/cli/src/bin.ts` and verify it still reads:

```ts
#!/usr/bin/env node
import { main } from "./main.js";

const argv = process.argv.slice(2);
Promise.resolve(main(argv)).then((code) => {
  if (argv[0] !== "author" || code !== 0) process.exit(code);
});
```

No change needed — `main` still returns `number | Promise<number>` and `author` still returns `0` synchronously while its server stays alive.

- [ ] **Step 10: Run the full CLI test suite + typecheck**

Run:

```bash
pnpm --filter @boyscoutdev/cli typecheck && pnpm vitest run apps/cli
```

Expected: PASS — including `main.test.ts` (4 tests), `init-prompts.test.ts` (3 tests), `init.test.ts`, `version.test.ts`, and `bridge-selection.test.ts`.

- [ ] **Step 11: Smoke-test the built binary end-to-end**

Run:

```bash
pnpm --filter @boyscoutdev/cli build
node apps/cli/dist/bin.js --version
node apps/cli/dist/bin.js init --root "$(mktemp -d)" --yes
```

Expected: first prints `0.1.0-alpha.3`; second prints `created …/.claude/skills/boyscout/SKILL.md` and `created …/reference/bridge-conventions.md` among the created files, then exits 0.

- [ ] **Step 12: Commit**

```bash
git add apps/cli/src/main.ts apps/cli/src/init.ts apps/cli/src/init-prompts.ts apps/cli/test/init-prompts.test.ts apps/cli/test/main.test.ts
git commit -m "feat(cli): route commands through commander and prompt with @clack/prompts"
```

---

## Final verification

- [ ] Run the whole repo suite once more: `pnpm test && pnpm -r typecheck`
- [ ] Confirm `apps/cli/package.json` version is `0.1.0-alpha.3`.
- [ ] Confirm `node apps/cli/dist/bin.js init --yes` (in a temp dir) writes exactly one skill dir `boyscout/` with `SKILL.md` + `reference/bridge-conventions.md` and no `boyscout-workflow/`.

## Notes for the release PR (not a code task)

- **Breaking for alpha.2 users:** re-running `init` is create-if-absent and will not remove the old `.claude/skills/boyscout/` (old conventions) or `.claude/skills/boyscout-workflow/` dirs. Call this out in the PR/changelog; no migration code ships.
