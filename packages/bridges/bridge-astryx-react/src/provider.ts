import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import { byteCompare } from "@boyscout/determinism";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { TEXT_CHILD } from "./catalog.js";

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/component.tsx.eta", import.meta.url)),
  "utf8",
);

function toPascalCase(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

function renderAttrs(props: Record<string, unknown>): string {
  const keys = Object.keys(props)
    .filter((k) => k !== "text")
    .sort(byteCompare);
  return keys
    .map((k) => {
      const v = props[k];
      return typeof v === "number" ? `${k}={${v}}` : `${k}="${String(v)}"`;
    })
    .join(" ");
}

function renderNode(node: AstNodeT): string {
  const props = node.props ?? {};
  const attrs = renderAttrs(props);
  const open = attrs ? `<${node.type} ${attrs}>` : `<${node.type}>`;
  let inner = "";
  if (TEXT_CHILD.has(node.type) && typeof props.text === "string") {
    inner = props.text;
  } else if (node.children) {
    inner = node.children.map(renderNode).join("");
  }
  return `${open}${inner}</${node.type}>`;
}

function collectTypes(node: AstNodeT, acc: Set<string>): void {
  acc.add(node.type);
  if (node.children) for (const c of node.children) collectTypes(c, acc);
}

export const componentProvider: Provider = {
  capability: "component",
  generate(feature: FeatureT): Asset[] {
    const used = new Set<string>();
    collectTypes(feature.tree, used);
    const imports = [...used].sort(byteCompare).join(", ");
    const name = toPascalCase(feature.id);
    const body = renderNode(feature.tree);
    const content = render(TEMPLATE, { imports, name, body });
    return [{ path: `${name}.tsx`, content }];
  },
};
