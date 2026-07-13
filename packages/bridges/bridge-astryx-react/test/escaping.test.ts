import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/provider.js";

const feature = (tree: unknown) =>
  ({ id: "x", capability: "component", tree, annotations: {}, props: {}, approved: true }) as never;

describe("astryx component provider escaping", () => {
  it("escapes special characters in JSX text children", () => {
    const [asset] = componentProvider.generate(
      feature({ type: "Text", props: { type: "body", text: 'a "q" <b> {c} & d' } }),
    );
    expect(asset?.content).toContain("a &quot;q&quot; &lt;b&gt; &#123;c&#125; &amp; d");
    expect(asset?.content).not.toContain("<b>");
  });

  it("escapes special characters in attribute string values", () => {
    const [asset] = componentProvider.generate(
      feature({ type: "Text", props: { type: 'a"<&', text: "hi" } }),
    );
    expect(asset?.content).toContain('type="a&quot;&lt;&amp;"');
  });
});
