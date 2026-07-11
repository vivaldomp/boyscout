import type { Asset, AssetRule, GuardrailResultT, SpecificationT } from "@boyscout/schemas";

export { biomeLint } from "./biome-lint.js";

interface TreeNode {
  type: string;
  children?: TreeNode[] | undefined;
}

function collectTypes(node: TreeNode, acc: string[]): void {
  acc.push(node.type);
  if (node.children) for (const child of node.children) collectTypes(child, acc);
}

function result(violations: string[]): GuardrailResultT {
  return { ok: violations.length === 0, violations, code: violations.length === 0 ? 200 : 422 };
}

/** Pre-barrier: every AST node type in every feature tree must exist in the bridge catalog. */
export function checkExpressible(spec: SpecificationT, allowedTypes: readonly string[]): GuardrailResultT {
  const allowed = new Set(allowedTypes);
  const violations: string[] = [];
  for (const feature of spec.features) {
    const types: string[] = [];
    collectTypes(feature.tree as TreeNode, types);
    for (const t of types) {
      if (!allowed.has(t)) violations.push(`feature ${feature.id}: unknown component "${t}"`);
    }
  }
  return result(violations);
}

/** Post-barrier engine: run every injected rule over every asset; any violation fails the gate (422). */
export function checkAssets(assets: readonly Asset[], rules: readonly AssetRule[]): GuardrailResultT {
  const violations: string[] = [];
  for (const asset of assets) {
    for (const rule of rules) violations.push(...rule(asset));
  }
  return result(violations);
}
