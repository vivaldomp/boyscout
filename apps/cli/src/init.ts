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
