import type { ContributionT } from "@boyscout/schemas";

/**
 * Assemble selected fragments into a full .openui document (spec version fixed at 1).
 * Deterministic: header + one "<capability> <id> =\n<tree-body>" block per contribution,
 * in the given order. The downstream parser is whitespace-tolerant, so fragments need not
 * be canonically formatted — parse+serialize normalizes them. Each fragment must be a
 * single root node; a multi-root fragment fails loudly at parse time (surfaced by compose).
 */
export function assembleDoc(
  bridge: string,
  platform: string,
  contributions: readonly ContributionT[],
): string {
  const header = `spec version=1 bridge=${bridge} platform=${platform}`;
  const blocks = contributions.map((c) => `${c.capability} ${c.id} =\n${c.openui.trim()}`);
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}
