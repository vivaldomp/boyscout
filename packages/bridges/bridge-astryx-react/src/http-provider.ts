import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const HTTP_NODE_TYPES = ["Http", "Endpoint"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/http.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/http.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Endpoint {
  name: string;
  method: string;
  path: string;
  pathLiteral: string;
  methodLiteral: string;
  response: string;
}

function endpointsOf(tree: AstNodeT): Endpoint[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Endpoint")
    .map((c) => {
      const p = c.props ?? {};
      const method = String(p.method ?? "GET");
      const path = String(p.path ?? "/");
      return {
        name: String(p.name ?? ""),
        method,
        path,
        pathLiteral: JSON.stringify(path),
        methodLiteral: JSON.stringify(method),
        response: String(p.response ?? "unknown"),
      };
    });
}

export function httpSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `http/${kebab(name)}.ts`,
    typedSignature: `${name}Transforms`,
    binding: "response transforms",
  };
}

export const httpProvider: Provider = {
  capability: "http",
  generate(feature: FeatureT): Asset[] {
    const name = String(feature.tree.props?.name ?? "");
    const endpoints = endpointsOf(feature.tree);
    const data = {
      endpoints,
      clientName: camel(name),
      transformsName: `${camel(name)}Transforms`,
      transformsInterface: `${name}Transforms`,
      importSpecifier: `../../src/http/${kebab(name)}.js`,
    };
    return [
      { path: `http/${name}.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: httpSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
