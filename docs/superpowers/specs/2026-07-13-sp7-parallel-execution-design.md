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

### 2. Default path — unchanged

`buildAssets(opts): Asset[]` stays **synchronous**, the exact current loop. Zero risk to existing callers. The opt-in parallel path is a separate async entrypoint (§4); nothing on the default path changes.

### 3. Format-only worker pool (determinism)

**Why format-only, not whole-node:** the toolchain has **no build step** — packages export `./src/index.ts` directly and run via vitest transpilation (no `dist`, no `tsx`/`ts-node`). A worker that ran `generate()` would have to import a **bridge** (TypeScript) — requiring a TS loader *and* forcing `runtime` to import concrete bridges, **breaking the D1 agnosticism invariant**. So the split is:

- **`generate()` stays on the main thread** — bridge providers are cheap sync string-building, invoked via the already-injected `Bridge` object. `runtime` never imports a bridge; agnosticism preserved.
- **`format()` (Biome/WASM — the actual hot path, a plain JS dep) is the parallelized unit.** The worker is **plain `.mjs`** importing `@biomejs/js-api/nodejs` directly — no TS, no loader, runs on Node 20.

Pool lives in **determinism** (which already owns Biome):
- `packages/determinism/src/format-worker.mjs` — worker entry: receives `{ source, lang }`, formats with its **own cached Biome instance** (hermetic CONFIG inlined), returns the formatted string.
- `packages/determinism/src/format-pool.ts` — `createFormatPool({ size }): { format(source, lang): Promise<string>; close(): Promise<void> }`. Persistent workers + a job queue, reused across the whole build (amortizes per-worker WASM init — the only reason the pool can net-win), `close()` terminates them.
- **Job input** `{ source, lang }` and **output** (formatted string) are both plain strings — trivially serializable across the thread boundary.
- **Drift guard:** the worker inlines the same hermetic Biome CONFIG as `format.ts`. A determinism test asserts the worker's output is byte-identical to `format()` across all langs (ts/tsx/js/json/css) — fails loudly if the two configs ever diverge.

### 4. Parallel executor (runtime)

`buildAssetsParallel(opts, { concurrency }): Promise<Asset[]>` shares the pipeline core with sync `buildAssets` (validate → plan → `featureById` → post-guardrail) via extracted helpers. The middle:
- Creates a format pool (`size = concurrency`), drives `schedule(graph, runNode, { concurrency: nodes.length })`.
- `runNode(nodeId)`: `provider.generate(feature)` on the main thread → `await Promise.all(rawAssets.map(a => pool.format(a.content, langOf(a.path))))` → returns that node's `Asset[]`.
- `schedule()` reassembles node results by `ordering` index; each node's `Asset[]` keeps provider-yield order; `close()` the pool; post-guardrail on the assembled array — identical to the sync path.

## Determinism guarantee

Output bytes depend only on `(graph, per-node generate/format)`, never on scheduling or on which worker formatted which asset (formatting is a pure function of `source, lang`). Enforced by: (a) `schedule()` indexing results by `ordering` position; (b) each node's `Asset[]` in provider-yield order; (c) the worker's hermetic CONFIG matching `format.ts` (drift-guarded); (d) post-guardrail and emit run on the fully-assembled, ordered array exactly as today.

## Tests / proofs

| Proof | Test |
|---|---|
| **Reassembly byte-identity** (core) | Inject a `runNode` that resolves in shuffled/reversed order (delays making fast nodes finish last); assert assembled bytes == sequential `buildAssets`. |
| **Dependency bounds honored** | Synthetic graph `A→B→C` + independent `D`; record start/finish per node; assert no node starts before all its deps finish. |
| **Cycle rejection** | Graph with a cycle → `schedule()` throws. |
| **Worker == `format()`** (drift guard) | Worker output byte-identical to `format()` across ts/tsx/js/json/css. |
| **Pool == sequential** | `buildAssetsParallel` output deep-equals `buildAssets` (multi-asset fake bridge). Since formatting is the only parallelized step and is bridge-agnostic, this + the worker drift guard cover every bridge transitively. |
| **Speedup (honest)** | Benchmark on a large synthetic spec: assert wall-clock win; **document the crossover** where small specs are net-slower due to worker/serialize/WASM overhead. Reported, not hidden. |

## Files (anticipated)

- `packages/planner/src/index.ts` — add `schedule()`.
- `packages/planner/test/schedule.test.ts` — reassembly, dependency-bounds, cycle tests.
- `packages/determinism/src/format-worker.mjs` — plain-JS worker: `{ source, lang }` → formatted string (own cached Biome).
- `packages/determinism/src/format-pool.ts` — `createFormatPool({ size })` (persistent workers + queue).
- `packages/determinism/test/format-pool.test.ts` — worker==`format()` drift guard, pool concurrency sanity.
- `packages/runtime/src/index.ts` — add `buildAssetsParallel`, extract shared pipeline helpers.
- `packages/runtime/test/parallel.test.ts` — pool==sequential (both bridges) + speedup benchmark.

## Non-goals recap

No edges in `plan()`, no `Feature` schema change, no config-schema change, no default-path change, no CLI surface. Add edges when `Feature` gains dependency data; add a CLI flag if end-users ever need runtime opt-in.
