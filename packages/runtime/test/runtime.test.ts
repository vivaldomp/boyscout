import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Asset, Bridge, FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { GateError, buildAssets, generate, loadConfig } from "../src/index.js";

// A tiny fake bridge — proves the runtime consumes Bridge by interface, no Astryx import.
const fakeBridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry: {
    capabilities: ["component"],
    nodeTypesFor: (c: string): readonly string[] => (c === "component" ? ["Card", "Text"] : []),
    providerFor: (cap) =>
      cap === "component"
        ? {
            capability: "component",
            generate: (f: FeatureT): Asset[] => [
              {
                path: `${f.id}.tsx`,
                content: `export const ${f.id} = () => <Card><Text>hi</Text></Card>;`,
              },
            ],
          }
        : undefined,
  },
  postRules: [(a) => (a.content.includes("<div") ? [`${a.path}: div`] : [])],
};

const config = loadConfig("platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n");

function spec(type = "Card") {
  return {
    version: "1",
    features: [
      {
        id: "widget",
        capability: "component",
        tree: { type, children: [{ type: "Text" }] },
        annotations: {},
        props: {},
        approved: true,
      },
    ],
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("loadConfig", () => {
  it("parses and validates boyscout.config.yaml", () => {
    expect(config.bridge).toBe("astryx-react");
    expect(config.capabilities).toEqual(["component"]);
  });
});

describe("buildAssets", () => {
  it("produces formatted assets for a valid spec", () => {
    const assets = buildAssets({ specInput: spec(), config, bridge: fakeBridge });
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe("widget.tsx");
    // Formatted by Biome: double quotes, trailing semicolon, final newline.
    expect(assets[0]?.content.endsWith("\n")).toBe(true);
  });

  it("throws GateError(422) at the pre-barrier for an unknown component", () => {
    try {
      buildAssets({ specInput: spec("Blob"), config, bridge: fakeBridge });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      expect((e as GateError).violations.some((v) => v.includes("Blob"))).toBe(true);
    }
  });

  it("throws GateError(422) at the post-barrier when generated content violates a postRule", () => {
    // Pre-barrier passes (Card/Text are valid componentTypes); the provider then
    // emits `<div` content, which fakeBridge.postRules rejects. Must throw before emit.
    const divBridge: Bridge = {
      ...fakeBridge,
      registry: {
        ...fakeBridge.registry,
        providerFor: () => ({
          capability: "component",
          generate: (): Asset[] => [
            { path: "widget.tsx", content: "export const widget = () => <div>x</div>;" },
          ],
        }),
      },
    };
    try {
      buildAssets({ specInput: spec(), config, bridge: divBridge });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      expect((e as GateError).violations.length).toBeGreaterThan(0);
      expect((e as GateError).violations.some((v) => v.includes("div"))).toBe(true);
    }
  });

  it("verify() skips durable assets — the post-barrier is scaffold-only (D2d)", () => {
    const b: Bridge = {
      ...fakeBridge,
      registry: {
        ...fakeBridge.registry,
        providerFor: () => ({
          capability: "component",
          generate: (): Asset[] => [
            { path: "Widget.tsx", content: "export const W = () => <Card/>;\n", durable: false },
            { path: "impl.ts", content: 'export const x = () => "<div";\n', durable: true },
          ],
        }),
      },
    };
    // The durable asset contains "<div" (which fakeBridge.postRules rejects); it must be ignored.
    const assets = buildAssets({ specInput: spec(), config, bridge: b });
    expect(assets.some((a) => a.durable)).toBe(true);
  });
});

describe("generate", () => {
  it("emits assets to <outDir>/.running and returns the paths", () => {
    const outDir = mkdtempSync(join(tmpdir(), "boyscout-"));
    const { emitted } = generate({ specInput: spec(), config, bridge: fakeBridge, outDir });
    expect(emitted).toHaveLength(1);
    const written = readFileSync(join(outDir, ".running", "widget.tsx"), "utf8");
    expect(written).toContain("Card");
  });

  it("rejects an asset path that escapes .running", () => {
    const escaping: Bridge = {
      ...fakeBridge,
      registry: {
        ...fakeBridge.registry,
        providerFor: () => ({
          capability: "component",
          generate: (): Asset[] => [{ path: "../evil.tsx", content: "export const x = <Card/>;" }],
        }),
      },
    };
    const outDir = mkdtempSync(join(tmpdir(), "boyscout-"));
    expect(() => generate({ specInput: spec(), config, bridge: escaping, outDir })).toThrow(
      /traversal|\.\./,
    );
  });
});
