import type { AstNodeT } from "@boyscout/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Renderer, type ComponentMap } from "../src/index.js";

const mock: ComponentMap = {
  Card: ({ children }) => createElement("section", { "data-c": "card" }, children),
  VStack: ({ node, children }) =>
    createElement(
      "div",
      { "data-c": "vstack", "data-gap": String(node.props?.gap ?? "") },
      children,
    ),
  Text: ({ node }) => createElement("p", null, String(node.props?.text ?? "")),
};

const render = (ast: AstNodeT) =>
  renderToStaticMarkup(createElement(Renderer, { ast, components: mock }));

describe("Renderer", () => {
  it("mounts mapped components, passes props, and nests children in order", () => {
    const ast: AstNodeT = {
      type: "Card",
      children: [
        {
          type: "VStack",
          props: { gap: 2 },
          children: [
            { type: "Text", props: { text: "one" } },
            { type: "Text", props: { text: "two" } },
          ],
        },
      ],
    };
    expect(render(ast)).toBe(
      '<section data-c="card"><div data-c="vstack" data-gap="2"><p>one</p><p>two</p></div></section>',
    );
  });

  it("renders a visible fallback for an unknown node type without throwing", () => {
    const ast: AstNodeT = { type: "Card", children: [{ type: "Mystery" }] };
    expect(render(ast)).toBe(
      '<section data-c="card"><div data-unknown-node="Mystery">⟨Mystery⟩</div></section>',
    );
  });
});
