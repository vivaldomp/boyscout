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
});
