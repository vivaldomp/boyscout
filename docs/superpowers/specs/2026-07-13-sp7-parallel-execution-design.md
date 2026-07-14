# SP7 — Parallel Execution (D8) — Design

> Sub-project SP7 of the v1 roadmap. Depends on SP2. Proof-of-done: **parallel output byte-identical to the sequential baseline, plus a measurable (honestly reported) speedup.**

## Thesis

Parallelism is an *optimization over an already-correct sequential executor* (SP2). The sequential goldens are the oracle: parallel execution must reproduce their bytes exactly. The determinism-critical work is **deterministic reassembly to graph order before emit** (§11.3); the speedup is secondary and honestly bounded.

## Grounding facts (current state)

- `plan()` (`packages/planner/src/index.ts`) emits one node per feature, byte-sorted, with **`edges: []`**. The `ExecutionGraph.edges` field exists in the schema but is never populated.
- `Feature` (`packages/schemas/src/index.ts`) carries **no dependency data** (`id, capability, tree, annotations, props, approved`). Nothing references another feature, so no edges can be derived. The FIRST-SPEC §6.3 route→component→service example is aspirational, not backed by the model.
- `buildAssets()` (`packages/runtime/src/index.ts`) loops `graph.ordering` **sequentially**: `provider.generate(feature)` (cheap sync string-building) → `format()`.
- `format()` (`packages/determinism/src/format.ts`) is **Biome-over-WASM, synchronous, in-process**, with a cached singleton instance — pure single-threaded CPU. `async`/Promise concurrency yields no speedup; only `worker_threads` gives real CPU parallelism.

**Consequence:** every node is genuinely independent today (embarrassingly parallel). SP7 does not invent dependency edges; it builds a scheduler that *honors* edges generically and proves reassembly.

## Scope

**In:**
1. A pure, deterministic, edge-respecting **scheduler** with reassembly-to-ordering, in `planner`.
2. An **opt-in `worker_threads` pool** executor in `runtime`, exposed as `buildAssetsParallel`.
3. Proofs: reassembly byte-identity, dependency-bound respect, pool-vs-sequential byte-identity on existing goldens (both bridges), and an honest speedup benchmark with documented crossover.

**Out (explicit):**
- Dependency inference / populating `edges` in `plan()` — needs a `Feature` schema change; separate future spec. The planner keeps emitting flat graphs.
- Worker pool as the **default** path — `buildAssets` stays the sync loop, untouched.
- CLI `--parallel` flag — proof is via the headless benchmark test only.
- Cross-run caching / incremental execution (D4, already out).

## Components

### 1. `schedule()` — pure scheduler (planner)

```
schedule(graph: ExecutionGraphT, runNode: (nodeId: string) => Promise<T>, opts: { concurrency: number }): Promise<T[]>
```

- Kahn-style scheduling: compute in-degree from `edges`; the ready-set (in-degree 0) is dispatched **in `graph.ordering` order**, up to `concurrency` in flight; on each completion, decrement dependents and enqueue newly-ready nodes.
- **Rejects cycles** (fail-closed) — `plan()` never produces them, but a generic edge-honoring scheduler must guard.
- Returns results **indexed by `ordering` position**, never by completion order. This is the determinism seam: the result array is a pure function of `(graph, runNode)`, independent of *when* nodes finish.
- Knows nothing about assets, Biome, or workers — `runNode` is fully injected.

### 2. Executors (runtime)

- **Default — unchanged.** `buildAssets(opts): Asset[]` stays **synchronous**, the exact current loop. Zero risk to existing callers.
- **Opt-in — new.** `buildAssetsParallel(opts, { concurrency }): Promise<Asset[]>`. Shares the pipeline core (validate → plan → `featureById` → post-guardrail) with the sync path via extracted helpers; only the middle differs — `schedule()` driving a worker pool, then flatten each node's `Asset[]` in ordering position (identical reassembly to the sync loop).

### 3. Worker job & bridge-by-id resolution (runtime)

- **Job input:** `{ bridgeId, feature }` — both JSON-serializable (`tree`, `props`, `annotations` are plain objects; `feature` is plain data).
- **Worker body:** import the bridge by `bridgeId`, run `registry.providerFor(feature.capability).generate(feature)`, `format()` each raw asset with the worker's **own cached Biome/WASM instance**, return `Asset[]` (`{ path, content, durable }` — serializable).
- **Bridge-by-id registry:** a small `{ [id]: () => import(...) }` map so a worker resolves the correct bridge module. Two bridges exist (`astryx-react`, `material`).
- **Pool:** persistent, size `min(concurrency, nodeCount)`, reused across all nodes (amortizes per-worker WASM init — the only reason the pool can net-win), terminated when the build ends.

## Determinism guarantee

Output bytes depend only on `(graph, per-node generate/format)`, never on scheduling. Enforced by: (a) `schedule()` indexing results by `ordering` position; (b) each node's `Asset[]` flattened in provider-yield order; (c) post-guardrail and emit run on the fully-assembled, ordered array exactly as today.

## Tests / proofs

| Proof | Test |
|---|---|
| **Reassembly byte-identity** (core) | Inject a `runNode` that resolves in shuffled/reversed order (delays making fast nodes finish last); assert assembled bytes == sequential `buildAssets`. |
| **Dependency bounds honored** | Synthetic graph `A→B→C` + independent `D`; record start/finish per node; assert no node starts before all its deps finish. |
| **Cycle rejection** | Graph with a cycle → `schedule()` throws. |
| **Pool == sequential** | `buildAssetsParallel` output byte-identical to `buildAssets` on existing goldens, **both bridges**. |
| **Speedup (honest)** | Benchmark on a large synthetic spec: assert wall-clock win; **document the crossover** where small specs are net-slower due to worker/serialize/WASM overhead. Reported, not hidden. |

## Files (anticipated)

- `packages/planner/src/index.ts` — add `schedule()`.
- `packages/planner/test/schedule.test.ts` — reassembly, dependency-bounds, cycle tests.
- `packages/runtime/src/index.ts` — add `buildAssetsParallel`, extract shared pipeline helpers.
- `packages/runtime/src/worker.ts` (or similar) — worker entry: bridge-by-id → generate → format → `Asset[]`.
- `packages/runtime/src/bridge-registry.ts` (or inline) — `{ id: () => import(...) }`.
- `packages/runtime/test/parallel.test.ts` — pool==sequential (both bridges) + speedup benchmark.

## Non-goals recap

No edges in `plan()`, no `Feature` schema change, no config-schema change, no default-path change, no CLI surface. Add edges when `Feature` gains dependency data; add a CLI flag if end-users ever need runtime opt-in.
