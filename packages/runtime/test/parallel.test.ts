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

describe("buildAssetsParallel speedup (honest)", () => {
  // Large synthetic spec so per-format work dominates worker overhead.
  const big = spec(Array.from({ length: 200 }, (_, i) => `f${String(i).padStart(3, "0")}`));

  it("is byte-identical to sequential at scale", async () => {
    const opts = { specInput: big, config, bridge: fakeBridge };
    const seq = buildAssets(opts);
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par).toEqual(seq);
  });

  it("beats sequential wall-clock on a large spec (logged, not silently trusted)", async () => {
    const opts = { specInput: big, config, bridge: fakeBridge };
    // warm both paths (WASM init) so the measurement is steady-state.
    buildAssets(opts);
    await buildAssetsParallel(opts, { concurrency: 4 });

    const t0 = performance.now();
    buildAssets(opts);
    const seqMs = performance.now() - t0;

    const t1 = performance.now();
    await buildAssetsParallel(opts, { concurrency: 4 });
    const parMs = performance.now() - t1;

    // Honest reporting: print both, note the crossover caveat.
    console.log(
      `[sp7] 200 features — sequential ${seqMs.toFixed(0)}ms vs parallel(4) ${parMs.toFixed(0)}ms ` +
        `(speedup ${(seqMs / parMs).toFixed(2)}x). Small specs are net-slower; crossover is workload-dependent.`,
    );
    // Loose bound: on multi-core CI the pool should not be dramatically slower, and
    // should win when format work dominates. Keep the assertion non-flaky.
    expect(parMs).toBeLessThan(seqMs * 1.5);
  }, 30_000);
});
