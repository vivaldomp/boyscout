import { describe, expect, it } from "vitest";
import { BoyscoutConfig, GuardrailResult, Specification } from "../src/index.js";

const sampleSpec = {
  version: "1",
  features: [
    {
      id: "hero",
      capability: "component",
      tree: { type: "Box", children: [{ type: "Text" }] },
      annotations: {},
      props: {},
      approved: true,
    },
  ],
  metadata: { bridge: "astryx-react", platform: "web", checksum: "abc" },
};

describe("Specification", () => {
  it("accepts a well-formed spec", () => {
    // biome-ignore lint/style/noNonNullAssertion: sampleSpec has exactly one feature
    expect(Specification.parse(sampleSpec).features[0]!.id).toBe("hero");
  });
  it("rejects a spec missing metadata", () => {
    const bad = { ...sampleSpec, metadata: undefined };
    expect(Specification.safeParse(bad).success).toBe(false);
  });
  it("rejects a feature missing an id", () => {
    const bad = structuredClone(sampleSpec);
    // @ts-expect-error intentional malformation
    delete bad.features[0].id;
    expect(Specification.safeParse(bad).success).toBe(false);
  });
});

describe("BoyscoutConfig", () => {
  it("accepts a minimal config", () => {
    const cfg = { platform: "web", bridge: "astryx-react", capabilities: ["component"] };
    expect(BoyscoutConfig.parse(cfg).bridge).toBe("astryx-react");
  });
});

describe("GuardrailResult", () => {
  it("accepts a passing result", () => {
    expect(GuardrailResult.parse({ ok: true, violations: [], code: 200 }).ok).toBe(true);
  });
});
