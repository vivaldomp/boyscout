import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import { byteCompare } from "@boyscout/determinism";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { CATALOG, TEXT_CHILD } from "./catalog.js";
import { kebab, pascal } from "./naming.js";

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/component.ts.eta", import.meta.url)),
  "utf8",
);

export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function selectorOf(type: string): string {
  const entry = CATALOG[type];
  if (!entry) throw new Error(`unknown material component node type "${type}"`);
  return entry.selector;
}

function renderAttrs(props: Record<string, unknown>): string {
  const keys = Object.keys(props)
    .filter((k) => k !== "text")
    .sort(byteCompare);
  return keys.map((k) => `${k}="${escapeAttr(String(props[k]))}"`).join(" ");
}

export function renderNode(node: AstNodeT): string {
  const sel = selectorOf(node.type);
  const props = node.props ?? {};
  const attrs = renderAttrs(props);
  const open = attrs ? `<${sel} ${attrs}>` : `<${sel}>`;
  let inner = "";
  if (TEXT_CHILD.has(node.type) && typeof props.text === "string") {
    inner = escapeText(props.text);
  } else if (node.children) {
    inner = node.children.map(renderNode).join("");
  }
  return `${open}${inner}</${sel}>`;
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
    const symbols = [...used]
      .sort(byteCompare)
      .map((t) => {
        const entry = CATALOG[t];
        if (!entry) throw new Error(`unknown material component node type "${t}"`);
        return { symbol: entry.symbol, importPath: entry.importPath };
      });
    const className = pascal(feature.id);
    const content = render(TEMPLATE, {
      imports: symbols,
      importList: symbols.map((s) => s.symbol).join(", "),
      selector: kebab(feature.id),
      className,
      body: renderNode(feature.tree),
    });
    return [{ path: `components/${className}.ts`, content, durable: false }];
  },
};
