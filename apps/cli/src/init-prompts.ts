import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import type { Agent, Scope } from "./agent-targets.js";
import { capabilitiesFor, type Stack } from "./bridges-map.js";
import type { InitOptions } from "./init.js";

const STACKS = ["react", "angular"] as const;
const AGENTS = ["claude", "cursor", "generic"] as const;
const SCOPES = ["local", "global"] as const;

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

function pick<T extends string>(
  v: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (v === undefined) return undefined;
  if (!allowed.includes(v as T)) {
    throw new Error(`invalid --${name} "${v}"; expected one of ${allowed.join(", ")}`);
  }
  return v as T;
}

async function choose<T extends string>(
  rl: Interface,
  label: string,
  options: readonly T[],
  def: T,
): Promise<T> {
  const menu = options.map((o, i) => `  ${i + 1}) ${o}${o === def ? " (default)" : ""}`).join("\n");
  const ans = (await rl.question(`${label}:\n${menu}\n> `)).trim();
  if (!ans) return def;
  const n = Number(ans);
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1] as T;
  return options.includes(ans as T) ? (ans as T) : def;
}

/** Comma-separated indices or names; blank → `[]`, which `init` reads as "all bridge capabilities". */
async function chooseCapabilities(rl: Interface, stack: Stack): Promise<string[]> {
  const all = capabilitiesFor(stack);
  const menu = all.map((c, i) => `  ${i + 1}) ${c}`).join("\n");
  const ans = (
    await rl.question(`Capabilities (comma-separated, blank = all):\n${menu}\n> `)
  ).trim();
  if (!ans) return [];
  return ans
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((tok) => {
      const n = Number(tok);
      return Number.isInteger(n) && n >= 1 && n <= all.length ? (all[n - 1] as string) : tok;
    })
    .filter((c) => all.includes(c));
}

export interface ResolveDeps {
  readonly isTty?: boolean;
  readonly input?: Readable;
  readonly output?: Writable;
}

/**
 * Resolve init options from flags, filling gaps with interactive prompts on a TTY (unless
 * `--yes`) and with defaults otherwise. Non-TTY never blocks on stdin — safe under `npx`
 * pipes and in tests. `capabilities: []` means "all of the stack's bridge capabilities".
 */
export async function resolveInitOptions(
  argv: string[],
  deps: ResolveDeps = {},
): Promise<InitOptions> {
  const isTty = deps.isTty ?? Boolean(process.stdin.isTTY);
  const skipPrompts = argv.includes("--yes");

  let stack = pick(flagValue(argv, "--stack"), STACKS, "stack") as Stack | undefined;
  let agent = pick(flagValue(argv, "--agent"), AGENTS, "agent") as Agent | undefined;
  let scope = pick(flagValue(argv, "--scope"), SCOPES, "scope") as Scope | undefined;
  const capsFlag = flagValue(argv, "--capabilities");
  let capabilities = capsFlag
    ? capsFlag
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const example = argv.includes("--example");

  if (isTty && !skipPrompts) {
    const rl = createInterface({
      input: deps.input ?? process.stdin,
      output: deps.output ?? process.stdout,
    });
    try {
      if (!stack) stack = await choose(rl, "Stack", STACKS, "react");
      if (!agent) agent = await choose(rl, "Coding agent", AGENTS, "claude");
      if (!capabilities) capabilities = await chooseCapabilities(rl, stack);
      if (!scope) scope = await choose(rl, "Scope", SCOPES, "local");
    } finally {
      rl.close();
    }
  }

  return {
    stack: stack ?? "react",
    agent: agent ?? "claude",
    scope: scope ?? "local",
    capabilities: capabilities ?? [],
    example,
  };
}
