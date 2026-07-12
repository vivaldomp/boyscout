import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { astryxOnly } from "./astryx-only.js";
import { COMPONENTS } from "./catalog.js";
import { HTTP_NODE_TYPES, httpProvider } from "./http-provider.js";
import { paramsFor } from "./params.js";
import { componentProvider } from "./provider.js";
import { SERVICE_NODE_TYPES, serviceProvider } from "./service-provider.js";
import { STORE_NODE_TYPES, storeProvider } from "./store-provider.js";

export { COMPONENTS } from "./catalog.js";
export { astryxOnly } from "./astryx-only.js";

export const registry: BridgeRegistry = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "service"
        ? SERVICE_NODE_TYPES
        : capability === "store"
          ? STORE_NODE_TYPES
          : capability === "http"
            ? HTTP_NODE_TYPES
            : [],
  paramsFor,
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "service"
        ? serviceProvider
        : capability === "store"
          ? storeProvider
          : capability === "http"
            ? httpProvider
            : undefined,
};

export const bridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry,
  postRules: [astryxOnly, biomeLint],
};
