import type { Asset, Bridge, FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { buildAssets, buildAssetsParallel, loadConfig } from "../src/index.js";

const fakeBridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry: {
    capabilities: ["component"],
    nodeTypesFor: (c) => (c === "component" ? ["Card", "Text"] : []),
    paramsFor: () => [],
    providerFor: (cap) =>
      cap === "component"
        ? {
            capability: "component",
            // two assets per feature — exercises intra-node asset ordering
            generate: (f: FeatureT): Asset[] => [
              { path: `${f.id}.tsx`, content: `export const ${f.id}=()=><Card><Text>hi</Text></Card>` },
              { path: `${f.id}.meta.json`, content: `{"id":"${f.id}"}` },
            ],
          }
        : undefined,
  },
  postRules: [(a) => (a.content.includes("<div") ? [`${a.path}: div`] : [])],
};

const config = loadConfig("platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n");

function spec(ids: string[]) {
  return {
    version: "1",
    features: ids.map((id) => ({
      id,
      capability: "component",
      tree: { type: "Card" },
      annotations: {},
      props: {},
      approved: true,
    })),
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("buildAssetsParallel", () => {
  it("produces output byte-identical to sequential buildAssets", async () => {
    const opts = { specInput: spec(["b", "a", "c"]), config, bridge: fakeBridge };
    const seq = buildAssets(opts);
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par).toEqual(seq);
  });

  it("preserves graph ordering and intra-node asset order under concurrency", async () => {
    const opts = { specInput: spec(["z", "a", "m"]), config, bridge: fakeBridge };
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par.map((a) => a.path)).toEqual([
      "a.tsx", "a.meta.json",
      "m.tsx", "m.meta.json",
      "z.tsx", "z.meta.json",
    ]);
  });
});
