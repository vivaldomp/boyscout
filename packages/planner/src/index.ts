import { canonicalJson, sortByBytes } from "@boyscout/determinism";
import type { ExecutionGraphT, SpecificationT } from "@boyscout/schemas";

/** Convert a validated Specification into a deterministic Execution Graph (sequential; one node per feature). */
export function plan(spec: SpecificationT): ExecutionGraphT {
  const nodes = sortByBytes(
    spec.features.map((f) => ({ id: f.id, capability: f.capability })),
    (n) => n.id,
  );
  return { nodes, edges: [], ordering: nodes.map((n) => n.id) };
}

/** Canonical serialization of a graph — the only sanctioned path (D3a). */
export function serializeGraph(graph: ExecutionGraphT): string {
  return canonicalJson(graph);
}
