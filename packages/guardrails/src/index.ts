import type {
  Asset,
  AssetRule,
  BridgeRegistry,
  GuardrailResultT,
  SpecificationT,
} from "@boyscout/schemas";

export { biomeLint } from "./biome-lint.js";

interface TreeNode {
  type: string;
  children?: TreeNode[] | undefined;
}

function collectTypes(node: TreeNode, acc: string[]): void {
  acc.push(node.type);
  if (node.children) for (const child of node.children) collectTypes(child, acc);
}

const CHILD_TYPE: Record<string, string> = { service: "Method", store: "Action", http: "Endpoint" };

const SAFE_IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
/** Governed node types whose `name` prop becomes a TS identifier / path segment and must be a safe identifier. */
const GOVERNED_NAME_NODES: Record<string, ReadonlySet<string>> = {
  service: new Set(["Service", "Method"]),
  store: new Set(["Store", "Action"]),
  http: new Set(["Http", "Endpoint"]),
};

function result(violations: string[]): GuardrailResultT {
  return { ok: violations.length === 0, violations, code: violations.length === 0 ? 200 : 422 };
}

/** Pre-barrier: each feature's capability must be registered, and every node type must be in that capability's vocabulary. */
export function checkExpressible(
  spec: SpecificationT,
  registry: Pick<BridgeRegistry, "capabilities" | "nodeTypesFor">,
): GuardrailResultT {
  const violations: string[] = [];
  for (const feature of spec.features) {
    if (!registry.capabilities.includes(feature.capability)) {
      violations.push(`feature ${feature.id}: unknown capability "${feature.capability}"`);
      continue;
    }
    const allowed = new Set(registry.nodeTypesFor(feature.capability));
    const types: string[] = [];
    collectTypes(feature.tree as TreeNode, types);
    for (const t of types) {
      if (!allowed.has(t)) violations.push(`feature ${feature.id}: unknown node type "${t}"`);
    }
    const childType = CHILD_TYPE[feature.capability];
    if (childType) {
      const tree = feature.tree as TreeNode;
      const count = (tree.children ?? []).filter((c) => c.type === childType).length;
      if (count === 0) {
        violations.push(
          `feature ${feature.id}: ${feature.capability} has no ${childType} children`,
        );
      }
    }
    const governed = GOVERNED_NAME_NODES[feature.capability];
    if (governed) {
      const checkName = (node: TreeNode): void => {
        if (governed.has(node.type)) {
          const name = (node as { props?: Record<string, unknown> }).props?.name;
          if (typeof name !== "string" || !SAFE_IDENT.test(name)) {
            violations.push(
              `feature ${feature.id}: ${node.type} has unsafe identifier name ${JSON.stringify(name)}`,
            );
          }
        }
        if (node.children) for (const c of node.children) checkName(c);
      };
      checkName(feature.tree as TreeNode);
    }
  }
  return result(violations);
}

/** Post-barrier engine: run every injected rule over every asset; any violation fails the gate (422). */
export function checkAssets(
  assets: readonly Asset[],
  rules: readonly AssetRule[],
): GuardrailResultT {
  const violations: string[] = [];
  for (const asset of assets) {
    for (const rule of rules) violations.push(...rule(asset));
  }
  return result(violations);
}
