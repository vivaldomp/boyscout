import { sortByBytes, writeBytes } from "@boyscout/determinism";
import type { Bridge, BridgeSkill } from "@boyscout/schemas";

/** Metadata for the composed agentskills.io SKILL.md. */
export interface SkillMeta {
  readonly name: string;
  readonly description: string;
}

/** Typed sections in fixed render order: [fragment field, markdown heading]. */
const SECTIONS: ReadonlyArray<readonly [keyof BridgeSkill, string]> = [
  ["conventions", "Conventions"],
  ["imports", "Imports"],
  ["tokens", "Tokens"],
  ["architecture", "Architecture"],
  ["naming", "Naming"],
];

/**
 * Compose selected bridges' typed knowledge fragments into an agentskills.io
 * SKILL.md string. Bridges are sorted by id; sections render in fixed order;
 * within a section each bridge whose fragment has a non-empty value renders one
 * `### <id>` sub-block.
 *
 * ponytail: this is an agent-context artifact, outside the D3a *generation*
 * determinism guarantee (the Skill does not participate in generation). It is
 * byte-stable by construction anyway — sorted bridges, fixed section order, LF
 * joins, single trailing newline — and canonicalized through writeBytes().
 */
export function composeSkill(bridges: readonly Bridge[], meta: SkillMeta): string {
  const ordered = sortByBytes(bridges, (b) => b.id);
  const blocks: string[] = [`---\nname: ${meta.name}\ndescription: ${meta.description}\n---`];

  for (const [field, heading] of SECTIONS) {
    const subs: string[] = [];
    for (const b of ordered) {
      const text = b.skill?.[field]?.trim();
      if (text) subs.push(`### ${b.id}\n${text}`);
    }
    if (subs.length > 0) blocks.push(`## ${heading}\n${subs.join("\n\n")}`);
  }

  return new TextDecoder().decode(writeBytes(blocks.join("\n\n")));
}
