import type { AgentSkill } from "./agent-targets.js";

/** Inputs that specialize the workflow guide to the scaffolded project. */
export interface WorkflowContext {
  readonly stack: "react" | "angular";
  readonly bridgeId: string;
  readonly platform: string;
  readonly capabilities: readonly string[];
}

/**
 * The main BoyScout skill (FIRST-SPEC §18): teaches an agent how to *drive* BoyScout —
 * the bridge conventions (how generated code should look) are bundled alongside it as a
 * reference this skill points to, not a separately triggerable skill.
 * Body only (no frontmatter); the agent-target adapter wraps it per tool.
 */
export function workflowSkill(ctx: WorkflowContext): AgentSkill {
  const caps = ctx.capabilities.join(", ");
  const bodyMarkdown = `## What BoyScout is
BoyScout is a governed, deterministic runtime for software generation: **you (the AI) decide _what_ to build; the Runtime decides _how_.** You author a declarative spec; the Runtime turns it into governed, byte-identical code. Never hand-write the framework code yourself — express intent in the spec and let \`generate\` produce it.

## The spec — \`boyscout-spec.json\`
This is the one file you edit. It is the "what to build". Shape:

\`\`\`json
{
  "version": "1",
  "features": [
    { "id": "kebab-id", "capability": "component", "approved": true, "annotations": {}, "props": {}, "tree": { "type": "…", "props": {}, "children": [] } }
  ],
  "metadata": { "bridge": "${ctx.bridgeId}", "platform": "${ctx.platform}", "checksum": "" }
}
\`\`\`

- \`metadata.bridge\` and \`metadata.platform\` **must** stay \`${ctx.bridgeId}\` / \`${ctx.platform}\` — the Runtime rejects a mismatch.
- Enabled capabilities for this project: **${caps}**. Each feature's \`capability\` must be one of them, and its \`tree\` must use only node types that capability allows (a guardrail rejects unknown types).
- A feature only generates once \`approved\` is \`true\`.

## Commands
- \`boyscout generate\` — reads the spec + \`boyscout.config.yaml\`, emits code, writes \`boyscout.lock\`. Run this after every spec edit.
- \`boyscout generate --check\` — regenerates and fails (exit 1) if output drifts from \`boyscout.lock\`. Use in CI / before committing.
- \`boyscout author\` — starts the local browser authoring loop (preview a \`.openui\` design, approve it into the spec).
- \`boyscout init\` — scaffolds config, spec, and the boyscout skill (create-if-absent; safe to re-run).

A guardrail violation prints \`422 gate failed\` and emits **nothing** — fix the spec and re-run; non-conforming code never reaches the repo.

## The two-file seam
- \`.running/\` — generated, **disposable**, overwritten every run. The Runtime owns it. Never hand-edit it.
- \`src/\` — for logic-bearing capabilities (e.g. service/store/http), a durable stub is created **once** and never overwritten. Put human logic here; a typed contract pins the seam so signature drift becomes a compile error.

## The loop
1. Edit \`boyscout-spec.json\` — add or change a feature.
2. \`boyscout generate\`.
3. Review \`.running/\`; write real logic in the \`src/\` files.
4. Commit the spec, your \`src/\` code, and \`boyscout.lock\` together. Same spec + same lock = same bytes on any OS.`;

  return {
    name: "boyscout",
    description:
      'Use when generating, designing, diagramming, or building any frontend/UI screen, component, feature, form, or transaction — BoyScout turns a declarative spec into governed, byte-deterministic React/Angular code. Trigger on "build a screen", "create a component", "add a feature", "design a form/flow", or any UI/frontend codegen. You author the spec; the Runtime emits the code.',
    bodyMarkdown,
  };
}
