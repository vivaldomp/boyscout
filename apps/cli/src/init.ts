import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { canonicalJson, writeBytes } from "@boyscout/determinism";
import type { Bridge } from "@boyscout/schemas";
import { composeSkill } from "@boyscout/skill-template";
import {
  type Agent,
  type OutFile,
  type Scope,
  skillFiles,
  stripFrontmatter,
} from "./agent-targets.js";
import { bridgeFor, type Stack } from "./bridges-map.js";
import { resolveInitOptions } from "./init-prompts.js";
import { workflowSkill } from "./workflow-skill.js";

/** Resolved answers that fully determine what `init` writes. */
export interface InitOptions {
  readonly stack: Stack;
  readonly agent: Agent;
  /** Enabled capabilities; empty means "all of the stack's bridge capabilities". */
  readonly capabilities: readonly string[];
  readonly scope: Scope;
  /** Seed the demo spec (React/Astryx only) instead of an empty one. */
  readonly example: boolean;
}

export const DEFAULT_INIT_OPTIONS: InitOptions = {
  stack: "react",
  agent: "claude",
  capabilities: [],
  scope: "local",
  example: false,
};

/**
 * Demo spec kept behind `--example` (React/Astryx only — its node types belong to that bridge).
 * A UserCard component + a UserService service, enough for `generate` to emit both tiers.
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
    {
      id: "user-service",
      capability: "service",
      approved: true,
      annotations: {},
      props: {},
      tree: {
        type: "Service",
        props: { name: "UserService" },
        children: [
          {
            type: "Method",
            props: { name: "getUsers", params: "", returns: "Promise<string[]>" },
          },
        ],
      },
    },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

/** Nominal meta for composeSkill — only feeds the frontmatter, which is stripped for the reference body. */
const REFERENCE_META = {
  name: "bridge-conventions",
  description: "BoyScout bridge conventions.",
};

export interface InitResult {
  readonly created: readonly string[];
  readonly skipped: readonly string[];
}

/** `platform`/`bridge`/`capabilities` conforming to the BoyscoutConfig schema. */
function configYaml(bridge: Bridge, capabilities: readonly string[]): string {
  const caps = capabilities.map((c) => `  - ${c}`).join("\n");
  return `platform: ${bridge.platform}\nbridge: ${bridge.id}\ncapabilities:\n${caps}\n`;
}

/** A minimal, schema-valid spec with no features — the default `init` seed. */
function emptySpec(bridge: Bridge) {
  return {
    version: "1",
    features: [],
    metadata: { bridge: bridge.id, platform: bridge.platform, checksum: "" },
  };
}

/** Display label: project-relative when inside `root`, else the absolute path (global scope). */
function labelFor(root: string, abs: string): string {
  const rel = relative(root, abs);
  return rel && !rel.startsWith("..") ? rel : abs;
}

/**
 * Scaffold a BoyScout project under `root` from resolved `opts`. Create-if-absent (D2b): an
 * existing file is never overwritten, so `init` is safe to re-run in a live project. Config,
 * spec, the main skill, and the bundled bridge-conventions reference are all derived from the
 * selected bridge — seeding another bridge's knowledge would misinform the agent.
 */
export function init(root: string, opts: InitOptions = DEFAULT_INIT_OPTIONS): InitResult {
  const bridge = bridgeFor(opts.stack);
  const capabilities =
    opts.capabilities.length > 0 ? opts.capabilities : [...bridge.registry.capabilities];
  const spec = opts.example && opts.stack === "react" ? SEED_SPEC : emptySpec(bridge);

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

  const created: string[] = [];
  const skipped: string[] = [];
  for (const { abs, content } of files) {
    const label = labelFor(root, abs);
    if (existsSync(abs)) {
      skipped.push(label);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, writeBytes(content));
    created.push(label);
  }
  return { created, skipped };
}

/** `boyscout init [--root .] [--stack react|angular] [--agent claude|cursor|generic] [--capabilities a,b] [--scope local|global] [--example] [--yes]` */
export async function initCommand(argv: string[]): Promise<number> {
  const i = argv.indexOf("--root");
  const root = i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : ".";
  let opts: InitOptions;
  try {
    opts = await resolveInitOptions(argv);
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
