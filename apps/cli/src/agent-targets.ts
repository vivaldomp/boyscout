import { homedir } from "node:os";
import { join } from "node:path";

/** Coding agent the skill files target. Determines file layout and wrapper format. */
export type Agent = "claude" | "cursor" | "generic";
/** Where agent guidance is written. Only Claude Code has a standard user-global skills dir. */
export type Scope = "local" | "global";

/** A frontmatter-less skill: section markdown plus the metadata each agent wraps its own way. */
export interface AgentSkill {
  /** slug — skill dir / rule file / AGENTS.md section id. */
  readonly name: string;
  readonly description: string;
  /** Markdown body with NO frontmatter (starts at the first `##` heading). */
  readonly bodyMarkdown: string;
}

/** An absolute file path and its content; the caller canonicalizes bytes and handles create-if-absent. */
export interface OutFile {
  readonly abs: string;
  readonly content: string;
}

/** The bundled bridge-conventions reference the main skill points to (no frontmatter). */
export interface SkillReference {
  readonly bodyMarkdown: string;
}

/** Minimal YAML double-quoted scalar — safe for frontmatter values (mirrors skill-template). */
function yamlString(s: string): string {
  return `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]/g, "\\n")}"`;
}

/** Strip the leading `---\n…\n---\n\n` block composeSkill emits, leaving the section body. */
export function stripFrontmatter(md: string): string {
  const m = md.match(/^---\n[\s\S]*?\n---\n\n/);
  return m ? md.slice(m[0].length) : md;
}

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
