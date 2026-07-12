import { describe, expect, it } from "vitest";
import { COMPONENTS } from "../src/catalog.js";
import { bridge, registry } from "../src/index.js";

describe("bridge registry", () => {
  it("declares the component capability and astryx-react identity", () => {
    expect(bridge.id).toBe("astryx-react");
    expect(bridge.platform).toBe("react");
    expect(registry.capabilities).toContain("component");
    expect(registry.providerFor("component")?.capability).toBe("component");
    expect(registry.providerFor("nope")).toBeUndefined();
  });

  it("carries both post-barrier rules (design-system + biome lint)", () => {
    expect(bridge.postRules.length).toBeGreaterThanOrEqual(2);
  });
});

describe("registry <-> @astryxdesign/core contract (§8.4)", () => {
  it("every catalog component is a real export of @astryxdesign/core", async () => {
    const mod = (await import("@astryxdesign/core")) as Record<string, unknown>;
    for (const name of COMPONENTS) {
      expect(mod[name], `${name} missing from @astryxdesign/core`).toBeDefined();
    }
  });
});
