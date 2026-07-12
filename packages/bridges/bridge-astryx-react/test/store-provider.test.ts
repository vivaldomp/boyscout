import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { STORE_NODE_TYPES, storeProvider, storeSeam } from "../src/store-provider.js";

const feature: FeatureT = {
  id: "cart-store",
  capability: "store",
  tree: {
    type: "Store",
    props: { name: "Cart", state: "{ items: string[] }" },
    children: [
      { type: "Action", props: { name: "addItem", payload: "string" } },
      { type: "Action", props: { name: "clear", payload: "void" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("store provider", () => {
  it("emits a .running hook scaffold and a durable handlers stub", () => {
    const assets = storeProvider.generate(feature);
    expect(assets).toHaveLength(2);
    const scaffold = assets.find((a) => !a.durable);
    const stub = assets.find((a) => a.durable);
    expect(scaffold?.path).toBe("stores/useCart.ts");
    expect(stub?.path).toBe("stores/cart.ts");
    expect(scaffold?.content).toContain('import { useReducer } from "react"');
    expect(scaffold?.content).toContain("interface CartHandlers");
    expect(scaffold?.content).toContain("const handlers: CartHandlers = cartHandlers");
    expect(stub?.content).toContain("addItem(state: { items: string[] }, payload: string)");
  });

  it("declares a spec-derived seam contract and vocabulary", () => {
    expect(storeSeam(feature).srcPath).toBe("stores/cart.ts");
    expect(STORE_NODE_TYPES).toEqual(["Store", "Action"]);
  });
});
