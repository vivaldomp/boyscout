import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { astryxOnly } from "./astryx-only.js";
import { COMPONENTS } from "./catalog.js";
import { componentProvider } from "./provider.js";
import { SERVICE_NODE_TYPES, serviceProvider } from "./service-provider.js";

export { COMPONENTS } from "./catalog.js";
export { astryxOnly } from "./astryx-only.js";

export const registry: BridgeRegistry = {
  capabilities: ["component", "service"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "service"
        ? SERVICE_NODE_TYPES
        : [],
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "service"
        ? serviceProvider
        : undefined,
};

export const bridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry,
  postRules: [astryxOnly, biomeLint],
};
