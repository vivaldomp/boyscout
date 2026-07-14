import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { camel, kebab, pascal } from "./naming.js";

export const ROUTE_NODE_TYPES: readonly string[] = ["Routes", "Route"];

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/route.ts.eta", import.meta.url)),
  "utf8",
);

interface Route {
  pathLiteral: string;
  className: string;
  importLiteral: string;
}

function routesOf(tree: AstNodeT): Route[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Route")
    .map((c) => {
      const p = c.props ?? {};
      const className = pascal(String(p.component ?? ""));
      return {
        pathLiteral: JSON.stringify(String(p.path ?? "")),
        className,
        importLiteral: JSON.stringify(`../components/${className}.js`),
      };
    });
}

export const routeProvider: Provider = {
  capability: "route",
  generate(feature: FeatureT): Asset[] {
    const content = render(TEMPLATE, {
      constName: camel(feature.id),
      routes: routesOf(feature.tree),
    });
    return [{ path: `routes/${kebab(feature.id)}.routes.ts`, content, durable: false }];
  },
};
