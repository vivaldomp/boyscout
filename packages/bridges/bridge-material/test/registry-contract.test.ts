import { runRegistryContract } from "@boyscout/bridge-contract-kit";
import { bridge } from "../src/index.js";
import { verifyMaterialCatalog } from "../src/verify-catalog.js";

runRegistryContract(bridge, {
  expectedId: "material",
  expectedPlatform: "angular",
  capabilities: ["component", "form", "route", "http"],
  minPostRules: 2,
  verifyCatalog: () => verifyMaterialCatalog(),
});
