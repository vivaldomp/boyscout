import { expectTypeOf, test } from "vitest";
import type { Asset, AssetRule, Bridge, BridgeRegistry, FeatureT, Provider } from "../src/index.js";

test("Bridge contract shapes", () => {
  const asset: Asset = { path: "UserCard.tsx", content: "export {}" };
  expectTypeOf(asset.path).toEqualTypeOf<string>();

  const rule: AssetRule = (a) => (a.content === "" ? ["empty"] : []);
  expectTypeOf(rule).parameter(0).toEqualTypeOf<Asset>();
  expectTypeOf(rule).returns.toEqualTypeOf<string[]>();

  const provider: Provider = {
    capability: "component",
    generate: (_f: FeatureT): Asset[] => [asset],
  };
  expectTypeOf(provider.generate).returns.toEqualTypeOf<Asset[]>();

  const registry: BridgeRegistry = {
    capabilities: ["component"],
    componentTypes: ["Card"],
    providerFor: (_c: string): Provider | undefined => provider,
  };

  const bridge: Bridge = {
    id: "astryx-react",
    platform: "react",
    registry,
    postRules: [rule],
  };
  expectTypeOf(bridge.registry).toEqualTypeOf<BridgeRegistry>();
});
