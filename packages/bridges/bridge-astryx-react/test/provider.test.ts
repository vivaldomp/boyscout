import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { componentProvider } from "../src/provider.js";

const feature: FeatureT = {
  id: "user-card",
  capability: "component",
  tree: {
    type: "Card",
    children: [
      {
        type: "VStack",
        props: { gap: 2 },
        children: [
          { type: "Heading", props: { level: 3, text: "Profile" } },
          { type: "Text", props: { type: "body", text: "Hello" } },
        ],
      },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("componentProvider.generate", () => {
  it("emits one .tsx asset named PascalCase from the feature id", () => {
    const [asset, ...rest] = componentProvider.generate(feature);
    expect(rest).toHaveLength(0);
    expect(asset?.path).toBe("UserCard.tsx");
  });

  it("imports only the used components, byte-sorted, from @astryxdesign/core", () => {
    const [asset] = componentProvider.generate(feature);
    expect(asset?.content).toContain(
      'import { Card, Heading, Text, VStack } from "@astryxdesign/core";',
    );
  });

  it("renders props as JSX attributes (number={n}, string=\"s\") and `text` as the child", () => {
    const [asset] = componentProvider.generate(feature);
    expect(asset?.content).toContain("<VStack gap={2}>");
    expect(asset?.content).toContain('<Heading level={3}>Profile</Heading>');
    expect(asset?.content).toContain('<Text type="body">Hello</Text>');
  });
});
