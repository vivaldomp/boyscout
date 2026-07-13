import type { DialectRegistry } from "@boyscout/dialect";

const NODE_TYPES: Record<string, readonly string[]> = {
  component: ["VStack", "HStack", "Card", "Grid", "Heading", "Text", "Button"],
  service: ["Service", "Method"],
  store: ["Store", "Action"],
  http: ["Http", "Endpoint"],
};

const PARAMS: Record<string, readonly string[]> = {
  VStack: ["gap"],
  HStack: ["gap"],
  Card: [],
  Grid: ["columns"],
  Heading: ["level", "text"],
  Text: ["type", "text"],
  Button: ["variant", "text"],
  Service: ["name"],
  Method: ["name", "params", "returns"],
  Store: ["name", "state"],
  Action: ["name", "payload"],
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export const mockRegistry: DialectRegistry = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (c) => NODE_TYPES[c] ?? [],
  paramsFor: (t) => PARAMS[t] ?? [],
};
