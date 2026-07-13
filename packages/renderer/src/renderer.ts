import type { AstNodeT } from "@boyscout/schemas";
import { createElement, type ReactElement, type ReactNode } from "react";

/** A component that renders one AST node. It reads its own `node.props`; the walker hands it rendered `children`. */
export type NodeComponent = (props: { node: AstNodeT; children?: ReactNode }) => ReactElement;

/** node type -> component. Injected by the caller (bridge-specific); the renderer stays agnostic. */
export type ComponentMap = Record<string, NodeComponent>;

function renderNode(node: AstNodeT, components: ComponentMap, key: number): ReactElement {
  const kids = (node.children ?? []).map((c, i) => renderNode(c, components, i));
  const Comp = components[node.type];
  if (!Comp) {
    return createElement(
      "div",
      { key, "data-unknown-node": node.type },
      `⟨${node.type}⟩`,
      ...kids,
    );
  }
  return createElement(Comp, { key, node }, kids.length > 0 ? kids : undefined);
}

/** Walk a generic AST and mount the injected component for each node. Pure: same (ast, map) -> same tree. */
export function Renderer(props: { ast: AstNodeT; components: ComponentMap }): ReactElement {
  return renderNode(props.ast, props.components, 0);
}
