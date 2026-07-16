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
