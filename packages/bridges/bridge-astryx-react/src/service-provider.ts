import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider, SeamContractT } from "@boyscout/schemas";
import { camel, kebab } from "./naming.js";

export const SERVICE_NODE_TYPES = ["Service", "Method"] as const;

const SCAFFOLD = readFileSync(
  fileURLToPath(new URL("../templates/service.ts.eta", import.meta.url)),
  "utf8",
);
const STUB = readFileSync(
  fileURLToPath(new URL("../templates/service.impl.ts.eta", import.meta.url)),
  "utf8",
);

interface Method {
  name: string;
  params: string;
  returns: string;
}

function methodsOf(tree: AstNodeT): Method[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Method")
    .map((c) => {
      const p = c.props ?? {};
      return {
        name: String(p.name ?? ""),
        params: String(p.params ?? ""),
        returns: String(p.returns ?? "void"),
      };
    });
}

/** The durable seam: stable spec-derived src path + the typed contract the human logic must satisfy. */
export function serviceSeam(feature: FeatureT): SeamContractT {
  const name = String(feature.tree.props?.name ?? "");
  return {
    srcPath: `services/${kebab(name)}.ts`,
    typedSignature: `${name}Contract`,
    binding: "typed re-export",
  };
}

export const serviceProvider: Provider = {
  capability: "service",
  generate(feature: FeatureT): Asset[] {
    const name = String(feature.tree.props?.name ?? "");
    const methods = methodsOf(feature.tree);
    const interfaceName = `${name}Contract`;
    const instanceName = camel(name);
    const importSpecifier = `../../src/services/${kebab(name)}.js`;
    const scaffold = render(SCAFFOLD, { interfaceName, instanceName, importSpecifier, methods });
    const stub = render(STUB, { instanceName, methods });
    return [
      { path: `services/${name}.ts`, content: scaffold, durable: false },
      { path: serviceSeam(feature).srcPath, content: stub, durable: true },
    ];
  },
};
