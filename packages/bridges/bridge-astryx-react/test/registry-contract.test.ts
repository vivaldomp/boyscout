import { runRegistryContract } from "@boyscout/bridge-contract-kit";
import { COMPONENTS } from "../src/catalog.js";
import { bridge } from "../src/index.js";

runRegistryContract(bridge, {
  expectedId: "astryx-react",
  expectedPlatform: "react",
  capabilities: ["component", "service", "store", "http"],
  minPostRules: 2,
  verifyCatalog: async () => {
    const { expect } = await import("vitest");
    const mod = (await import("@astryxdesign/core")) as Record<string, unknown>;
    for (const name of COMPONENTS) {
      expect(mod[name], `${name} missing from @astryxdesign/core`).toBeDefined();
    }
  },
});
