import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/component-provider.js";

const feature: FeatureT = {
  id: "user-card",
  capability: "component",
  tree: {
    type: "Card",
    children: [
      { type: "CardTitle", props: { text: "Profile & <Overview>" } },
      { type: "CardContent", children: [{ type: "List", children: [{ type: "ListItem", props: { text: "Alice" } }] }] },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("componentProvider", () => {
  it("emits one non-durable standalone component asset", () => {
    const assets = componentProvider.generate(feature);
    expect(assets).toHaveLength(1);
    const a = assets[0];
    expect(a?.path).toBe("components/UserCard.ts");
    expect(a?.durable).toBeFalsy();
  });

  it("uses Material selectors, imports used symbols, escapes text", () => {
    const c = componentProvider.generate(feature)[0]?.content ?? "";
    expect(c).toContain('selector: "user-card"');
    expect(c).toContain("export class UserCard");
    expect(c).toContain("<mat-card>");
    expect(c).toContain("<mat-card-title>");
    expect(c).toContain('import { MatCard } from "@angular/material/card"');
    expect(c).toContain('import { MatList } from "@angular/material/list"');
    // text is HTML-escaped
    expect(c).toContain("Profile &amp; &lt;Overview&gt;");
  });

  it("neutralizes template-literal injection payloads in text props", () => {
    const injected: FeatureT = {
      id: "evil-card",
      capability: "component",
      tree: {
        type: "Card",
        children: [
          {
            type: "CardTitle",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: literal injection payload under test, not a template placeholder
            props: { text: "hi`});${globalThis}<b>{{x}}" },
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const c = componentProvider.generate(injected)[0]?.content ?? "";
    // backtick is escaped so it cannot terminate the generated template literal
    expect(c).toContain("hi\\`");
    // dollar is escaped so ${...} cannot be evaluated as a live JS interpolation
    expect(c).toContain("\\$");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal string under test, not a template placeholder
    expect(c).not.toContain("${globalThis}");
    // angle brackets are HTML-escaped
    expect(c).toContain("&lt;b&gt;");
    // braces are escaped so Angular does not treat {{x}} as interpolation
    expect(c).toContain("&#123;&#123;x&#125;&#125;");
  });

  it("rejects unsafe attribute names (template-literal key injection)", () => {
    const evil: FeatureT = {
      id: "evil-attr",
      capability: "component",
      tree: {
        type: "Card",
        props: { "${globalThis.PWNED=1}": "x" },
      },
      annotations: {},
      props: {},
      approved: true,
    };
    expect(() => componentProvider.generate(evil)).toThrow(/unsafe attribute name/);
  });

  it("still renders normal attribute names (e.g. data-testid) fine", () => {
    const withAttr: FeatureT = {
      id: "attr-card",
      capability: "component",
      tree: {
        type: "Card",
        props: { "data-testid": "user-card" },
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const c = componentProvider.generate(withAttr)[0]?.content ?? "";
    expect(c).toContain('<mat-card data-testid="user-card">');
  });
});
