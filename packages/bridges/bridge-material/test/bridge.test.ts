import { describe, expect, it } from "vitest";
import { bridge, registry } from "../src/index.js";

describe("material bridge assembly", () => {
  it("declares material/angular identity and all four capabilities", () => {
    expect(bridge.id).toBe("material");
    expect(bridge.platform).toBe("angular");
    for (const cap of ["component", "form", "route", "http"]) {
      expect(registry.capabilities).toContain(cap);
      expect(registry.providerFor(cap)?.capability).toBe(cap);
    }
    expect(registry.providerFor("nope")).toBeUndefined();
  });

  it("carries both post-barrier rules (design-system + biome lint)", () => {
    expect(bridge.postRules.length).toBeGreaterThanOrEqual(2);
  });

  it("nodeTypesFor bounds each capability; unknown -> []", () => {
    expect(registry.nodeTypesFor("component")).toContain("Card");
    expect(registry.nodeTypesFor("http")).toEqual(["Http", "Endpoint"]);
    expect(registry.nodeTypesFor("nope")).toEqual([]);
  });
});
