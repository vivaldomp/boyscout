import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";
import { selectBridge } from "../src/main.js";

describe("selectBridge", () => {
  it("maps config bridge ids to bridge instances", () => {
    expect(selectBridge("astryx-react")).toBe(astryxBridge);
    expect(selectBridge("material")).toBe(materialBridge);
    expect(selectBridge("nope")).toBeUndefined();
  });
});

describe("material generation via the runtime (agnostic, unchanged runtime)", () => {
  const config = loadConfig("platform: angular\nbridge: material\ncapabilities:\n  - component\n");
  const spec = {
    version: "1",
    features: [
      {
        id: "user-card",
        capability: "component",
        tree: { type: "Card", children: [{ type: "CardTitle", props: { text: "Hi" } }] },
        annotations: {},
        props: {},
        approved: true,
      },
    ],
    metadata: { bridge: "material", platform: "angular", checksum: "" },
  };

  it("generates an Angular component asset", () => {
    const assets = buildAssets({ specInput: spec, config, bridge: materialBridge });
    expect(assets[0]?.path).toBe("components/UserCard.ts");
    expect(assets[0]?.content).toContain("@Component");
  });

  it("fails the runtime cross-check when spec metadata names another bridge", () => {
    const mismatched = { ...spec, metadata: { ...spec.metadata, bridge: "astryx-react" } };
    expect(() => buildAssets({ specInput: mismatched, config, bridge: materialBridge })).toThrow();
  });
});
