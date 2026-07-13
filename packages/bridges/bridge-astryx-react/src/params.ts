/** Ordered positional parameter names per AST node type — the DSL binds positional args to these (SP4a). */
const PARAMS: Record<string, readonly string[]> = {
  // component
  VStack: ["gap"],
  HStack: ["gap"],
  Card: [],
  Grid: ["columns"],
  Heading: ["level", "text"],
  Text: ["type", "text"],
  Button: ["variant", "text"],
  // service
  Service: ["name"],
  Method: ["name", "params", "returns"],
  // store
  Store: ["name", "state"],
  Action: ["name", "payload"],
  // http
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export function paramsFor(nodeType: string): readonly string[] {
  return PARAMS[nodeType] ?? [];
}
