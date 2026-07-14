import type { Asset, AssetRule } from "@boyscout/schemas";
import ts from "typescript";

// Irreducible native tags a Material form/interaction template must use.
const ALLOWED_NATIVE = new Set(["form", "input", "label", "button"]);

/** Collect the text of every `template:` property's string/template literal in the file. */
function templateLiterals(content: string, path: string): string[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "template") ||
        (ts.isStringLiteralLike(node.name) && node.name.text === "template"))
    ) {
      const init = node.initializer;
      if (ts.isNoSubstitutionTemplateLiteral(init) || ts.isStringLiteralLike(init)) {
        out.push(init.text);
      } else if (ts.isTemplateExpression(init)) {
        out.push(init.head.text + init.templateSpans.map((s) => s.literal.text).join(""));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/**
 * Post-barrier design-system rule (analog of astryxOnly): inside an inline
 * Angular `template`, every element tag must be a Material selector (`mat-*`)
 * or one of the irreducible native controls. Bare HTML layout primitives
 * (div, span, h1, ...) are violations. Assets with no inline template are skipped.
 * Only the template literal is scanned, so TS generics like `control<string>()`
 * in the class body are never mistaken for elements.
 */
export const materialOnly: AssetRule = (asset: Asset): string[] => {
  const violations: string[] = [];
  const seen = new Set<string>();
  for (const tpl of templateLiterals(asset.content, asset.path)) {
    for (const m of tpl.matchAll(/<([a-zA-Z][\w-]*)/g)) {
      const tag = (m[1] ?? "").toLowerCase();
      if (seen.has(tag)) continue;
      seen.add(tag);
      if (tag.startsWith("mat-") || ALLOWED_NATIVE.has(tag)) continue;
      violations.push(`${asset.path}: non-design-system element <${tag}>`);
    }
  }
  return violations;
};
