import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { astryxOnly } from "./astryx-only.js";
import { COMPONENTS } from "./catalog.js";
import { componentProvider } from "./provider.js";

export { COMPONENTS } from "./catalog.js";
export { astryxOnly } from "./astryx-only.js";

export const registry: BridgeRegistry = {
  capabilities: ["component"],
  nodeTypesFor: (capability) => (capability === "component" ? COMPONENTS : []),
  providerFor: (capability) => (capability === "component" ? componentProvider : undefined),
};

export const bridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry,
  postRules: [astryxOnly, biomeLint],
};
