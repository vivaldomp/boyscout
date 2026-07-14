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

/**
 * Deterministic, edge-honoring scheduler. Runs `runNode` for every node respecting
 * edge dependencies ({from,to} = "to depends on from"), up to `concurrency` in flight,
 * and returns results INDEXED BY `graph.ordering` position — never completion order.
 * This ordered reassembly is the determinism seam (§11.3): output is a pure function
 * of (graph, runNode). Throws on a dependency cycle (fail-closed).
 */
export async function schedule<T>(
  graph: ExecutionGraphT,
  runNode: (nodeId: string) => Promise<T>,
  opts: { concurrency: number },
): Promise<T[]> {
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) {
    throw new Error(`schedule: concurrency must be a positive integer, got ${opts.concurrency}`);
  }

  const orderIndex = new Map<string, number>(graph.ordering.map((id, i) => [id, i]));
  const indeg = new Map<string, number>(graph.ordering.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(graph.ordering.map((id) => [id, []]));
  for (const { from, to } of graph.edges) {
    indeg.set(to, (indeg.get(to) ?? 0) + 1);
    dependents.get(from)?.push(to);
  }

  const results = new Array<T>(graph.ordering.length);
  // Ready queue kept in ordering order for deterministic dispatch.
  const ready: string[] = graph.ordering.filter((id) => (indeg.get(id) ?? 0) === 0);
  let inFlight = 0;
  let done = 0;
  const total = graph.ordering.length;

  return new Promise<T[]>((resolve, reject) => {
    let settled = false;
    const fail = (e: unknown): void => {
      if (!settled) {
        settled = true;
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };

    const pump = (): void => {
      if (settled) return;
      if (done === total) {
        settled = true;
        resolve(results);
        return;
      }
      // Deadlock with work remaining but nothing runnable => cycle.
      if (inFlight === 0 && ready.length === 0 && done < total) {
        fail(new Error("schedule: dependency cycle detected"));
        return;
      }
      while (ready.length > 0 && inFlight < opts.concurrency) {
        const id = ready.shift() as string;
        inFlight++;
        runNode(id).then(
          (value) => {
            results[orderIndex.get(id) as number] = value;
            inFlight--;
            done++;
            for (const dep of dependents.get(id) ?? []) {
              const n = (indeg.get(dep) ?? 0) - 1;
              indeg.set(dep, n);
              if (n === 0) ready.push(dep); // pushed in edge-completion order; safe — output is reassembled by ordering
            }
            pump();
          },
          fail,
        );
      }
    };

    pump();
  });
}
