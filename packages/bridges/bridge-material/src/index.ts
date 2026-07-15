import { biomeLint } from "@boyscout/guardrails";
import type { Bridge, BridgeRegistry } from "@boyscout/schemas";
import { COMPONENTS, paramsFor } from "./catalog.js";
import { componentProvider } from "./component-provider.js";
import { FORM_NODE_TYPES, formProvider } from "./form-provider.js";
import { HTTP_NODE_TYPES, httpProvider } from "./http-provider.js";
import { materialOnly } from "./material-only.js";
import { ROUTE_NODE_TYPES, routeProvider } from "./route-provider.js";
import { skill } from "./skill.js";

export { CATALOG, COMPONENTS } from "./catalog.js";
export { verifyMaterialCatalog } from "./verify-catalog.js";
export { httpSeam } from "./http-provider.js";

export const registry: BridgeRegistry = {
  capabilities: ["component", "form", "route", "http"],
  nodeTypesFor: (capability) =>
    capability === "component"
      ? COMPONENTS
      : capability === "form"
        ? FORM_NODE_TYPES
        : capability === "route"
          ? ROUTE_NODE_TYPES
          : capability === "http"
            ? HTTP_NODE_TYPES
            : [],
  paramsFor,
  providerFor: (capability) =>
    capability === "component"
      ? componentProvider
      : capability === "form"
        ? formProvider
        : capability === "route"
          ? routeProvider
          : capability === "http"
            ? httpProvider
            : undefined,
};

export const bridge: Bridge = {
  id: "material",
  platform: "angular",
  version: "0.1.0",
  registry,
  postRules: [materialOnly, biomeLint],
  skill,
};
