import type { Asset, AssetRule } from "@boyscout/schemas";

// Irreducible native tags a Material form/interaction template must use.
const ALLOWED_NATIVE = new Set(["form", "input", "label", "button"]);

/**
 * Post-barrier design-system rule (analog of astryxOnly): inside an inline
 * Angular `template`, every element tag must be a Material selector (`mat-*`)
 * or one of the irreducible native controls. Bare HTML layout primitives
 * (div, span, h1, ...) are violations. Assets without a `template:` are skipped.
 */
export const materialOnly: AssetRule = (asset: Asset): string[] => {
  if (!/\btemplate\s*:/.test(asset.content)) return [];
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const m of asset.content.matchAll(/<([a-zA-Z][\w-]*)/g)) {
    const tag = (m[1] ?? "").toLowerCase();
    if (seen.has(tag)) continue;
    seen.add(tag);
    if (tag.startsWith("mat-") || ALLOWED_NATIVE.has(tag)) continue;
    violations.push(`${asset.path}: non-design-system element <${tag}>`);
  }
  return violations;
};
