import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const STORE_NODE_TYPES = ["Store", "Action"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/store.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/store.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Action {
  name: string;
  payload: string;
}

function actionsOf(tree: AstNodeT): Action[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Action")
    .map((c) => {
      const p = c.props ?? {};
      return { name: String(p.name ?? ""), payload: String(p.payload ?? "void") };
    });
}

export function storeSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `stores/${kebab(name)}.ts`,
    typedSignature: `${name}Handlers`,
    binding: "reducer handlers",
  };
}

export const storeProvider: Provider = {
  capability: "store",
  generate(feature: FeatureT): Asset[] {
    const p = feature.tree.props ?? {};
    const name = String(p.name ?? "");
    const state = String(p.state ?? "unknown");
    const actions = actionsOf(feature.tree);
    const data = {
      state,
      actions,
      hookName: `use${name}`,
      handlersName: `${camel(name)}Handlers`,
      stateType: `${name}State`,
      actionType: `${name}Action`,
      handlersInterface: `${name}Handlers`,
      importSpecifier: `../../src/stores/${kebab(name)}.js`,
    };
    return [
      { path: `stores/use${name}.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: storeSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
