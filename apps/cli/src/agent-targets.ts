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
 * Map skills to the files a given agent reads, honoring scope.
 *
 * `global` only means anything for Claude Code (`~/.claude/skills`); Cursor and the generic
 * `AGENTS.md` have no standard user-global rules *file*, so they always write project-local.
 * The command layer prints a note when it downgrades a requested global scope.
 */
export function skillFiles(
  root: string,
  agent: Agent,
  scope: Scope,
  skills: readonly AgentSkill[],
): OutFile[] {
  switch (agent) {
    case "claude": {
      const base =
        scope === "global" ? join(homedir(), ".claude", "skills") : join(root, ".claude", "skills");
      return skills.map((s) => ({
        abs: join(base, s.name, "SKILL.md"),
        content: `---\nname: ${yamlString(s.name)}\ndescription: ${yamlString(s.description)}\n---\n\n${s.bodyMarkdown}`,
      }));
    }
    case "cursor":
      return skills.map((s) => ({
        abs: join(root, ".cursor", "rules", `${s.name}.mdc`),
        content: `---\ndescription: ${yamlString(s.description)}\nalwaysApply: true\n---\n\n${s.bodyMarkdown}`,
      }));
    case "generic": {
      const body = skills.map((s) => `## ${s.name}\n\n${s.bodyMarkdown.trim()}`).join("\n\n");
      return [{ abs: join(root, "AGENTS.md"), content: `# BoyScout — agent guide\n\n${body}\n` }];
    }
  }
}
