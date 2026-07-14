import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab, pascal } from "./naming.js";

export const HTTP_NODE_TYPES: readonly string[] = ["Http", "Endpoint"];

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/http.service.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/http.transforms.ts.eta", import.meta.url)),
  "utf8",
);

interface Endpoint {
  name: string;
  method: string;
  path: string;
  methodLiteral: string;
  pathLiteral: string;
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
        // Endpoint name lands in identifier positions (interface method, service
        // method, stub method, transforms.<name>(raw) call) — sanitize to a safe
        // identifier so untrusted AST props can't break out of those positions.
        name: camel(String(p.name ?? "")),
        method,
        path,
        methodLiteral: JSON.stringify(method),
        pathLiteral: JSON.stringify(path),
        response: String(p.response ?? "unknown"),
      };
    });
}

export function httpSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `http/${kebab(name)}.transforms.ts`,
    typedSignature: `${pascal(name)}Transforms`,
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
      serviceClass: `${pascal(name)}Service`,
      transformsName: `${camel(name)}Transforms`,
      transformsInterface: `${pascal(name)}Transforms`,
      importSpecifier: `../../src/http/${kebab(name)}.transforms.js`,
    };
    return [
      { path: `http/${pascal(name)}.service.ts`, content: render(SCAFFOLD, data), durable: false },
      { path: httpSeam(feature).srcPath, content: render(STUB, data), durable: true },
    ];
  },
};
