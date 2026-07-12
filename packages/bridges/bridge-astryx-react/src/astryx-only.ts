import type { Asset, AssetRule } from "@boyscout/schemas";
import ts from "typescript";

/** Post-barrier: emitted JSX must use only design-system (capitalized) components — no bare intrinsics. */
export const astryxOnly: AssetRule = (asset: Asset): string[] => {
  const source = ts.createSourceFile(asset.path, asset.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag)) violations.push(`${asset.path}: non-design-system element <${tag}>`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
};
