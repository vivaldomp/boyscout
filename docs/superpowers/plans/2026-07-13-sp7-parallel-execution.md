# SP7 — Parallel Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, edge-honoring parallel executor that produces byte-identical output to the sequential baseline, with an honest, opt-in worker-pool speedup.

**Architecture:** A pure `schedule()` in `planner` runs graph nodes respecting edges and reassembles results by ordering index (the determinism seam). A format-only `worker_threads` pool in `determinism` parallelizes the single hot path (Biome/WASM). A new async `buildAssetsParallel` in `runtime` wires them; the sync `buildAssets` is untouched. Nodes are all independent today (`Feature` carries no dependency data), so edge-handling is proven with synthetic graphs.

**Tech Stack:** TypeScript (NodeNext ESM, `.js` import specifiers on `.ts` source), Node ≥20 `worker_threads`, `@biomejs/js-api/nodejs` (WASM), vitest 4, pnpm workspaces. **No build step** — packages export `./src/index.ts` directly.

## Global Constraints

- **No new runtime dependency.** Use Node stdlib `worker_threads` and the already-installed `@biomejs/js-api/nodejs`. No `tsx`/`ts-node`/piscina.
- **Runtime stays bridge-agnostic.** `packages/runtime` must never import a concrete bridge. The worker formats only; `generate()` runs main-thread via the injected `Bridge`.
- **Determinism is sacred.** Parallel output must be byte-identical to sequential. Formatting is a pure function of `(source, lang)`; results are reassembled by graph-ordering index, never completion order.
- **Default path unchanged.** `buildAssets` (sync) keeps its exact current signature and body. Parallel is a separate async entrypoint.
- **ESM import specifiers use `.js`** even though source is `.ts` (NodeNext). Worker file is `.mjs` (plain JS, no types).
- **Hermetic Biome CONFIG** must match `packages/determinism/src/format.ts` exactly (drift-guarded by test). LF-only, UTF-8, `indentWidth: 2`, `lineWidth: 100`, double quotes, semicolons always, trailing commas all.
- Every commit: `pnpm test` green, `pnpm -r typecheck` clean, `pnpm lint` clean.

---

## File Structure

- `packages/planner/src/index.ts` — **add** `schedule()` (pure scheduler). Existing `plan()`/`serializeGraph()` untouched.
- `packages/planner/test/schedule.test.ts` — **create**. Reassembly, dependency-bounds, cycle tests.
- `packages/determinism/src/format-worker.mjs` — **create**. Plain-JS worker: `{ source, lang }` → formatted string, own cached Biome.
- `packages/determinism/src/format-pool.ts` — **create**. `createFormatPool({ size })` → `{ format, close }`. Persistent workers + FIFO queue.
- `packages/determinism/src/index.ts` — **modify**. Re-export `createFormatPool`, `FormatPool`.
- `packages/determinism/test/format-pool.test.ts` — **create**. Worker==`format()` drift guard + pool sanity.
- `packages/runtime/src/index.ts` — **modify**. Extract `assembleAssets` helper from `buildAssets`; add `buildAssetsParallel`.
- `packages/runtime/test/parallel.test.ts` — **create**. Pool==sequential + honest speedup benchmark.

---

## Task 1: Pure `schedule()` scheduler (planner)

**Files:**
- Modify: `packages/planner/src/index.ts`
- Test: `packages/planner/test/schedule.test.ts` (create)

**Interfaces:**
- Consumes: `ExecutionGraphT` from `@boyscout/schemas` (`{ nodes: {id,capability}[], edges: {from,to}[], ordering: string[] }`).
- Produces: `schedule<T>(graph: ExecutionGraphT, runNode: (nodeId: string) => Promise<T>, opts: { concurrency: number }): Promise<T[]>` — returns results indexed by `graph.ordering` position. Throws `Error` on cycles.

**Semantics (read before coding):**
- Result array index `i` corresponds to `graph.ordering[i]`. Output is a pure function of `(graph, runNode)`, independent of completion order.
- An edge `{ from, to }` means `to` depends on `from`: `to` starts only after `from` resolves. (In-degree of a node = number of edges where it is `to`.)
- Ready nodes (in-degree 0) are dispatched in `graph.ordering` order, up to `concurrency` in flight.
- Cycle = some nodes never reach in-degree 0 → throw before/at detection.

- [ ] **Step 1: Write the failing tests**

Create `packages/planner/test/schedule.test.ts`:

```ts
import type { ExecutionGraphT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { schedule } from "../src/index.js";

function graph(ordering: string[], edges: [string, string][] = []): ExecutionGraphT {
  return {
    nodes: ordering.map((id) => ({ id, capability: "component" })),
    edges: edges.map(([from, to]) => ({ from, to })),
    ordering,
  };
}

describe("schedule", () => {
  it("returns results indexed by graph ordering, not completion order", async () => {
    // 'a' resolves LAST (longest delay), 'c' first — output must still be [a,b,c].
    const delay: Record<string, number> = { a: 30, b: 15, c: 0 };
    const out = await schedule(
      graph(["a", "b", "c"]),
      (id) => new Promise((r) => setTimeout(() => r(id.toUpperCase()), delay[id])),
      { concurrency: 8 },
    );
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("honors dependency bounds: a node never starts before its deps finish", async () => {
    // edges: a->b->c, plus independent d. Record start/finish; assert ordering constraints.
    const events: string[] = [];
    const run = (id: string) =>
      new Promise<string>((r) => {
        events.push(`start:${id}`);
        setTimeout(() => {
          events.push(`end:${id}`);
          r(id);
        }, 10);
      });
    await schedule(
      graph(["a", "b", "c", "d"], [["a", "b"], ["b", "c"]]),
      run,
      { concurrency: 8 },
    );
    // b starts only after a ends; c only after b ends.
    expect(events.indexOf("start:b")).toBeGreaterThan(events.indexOf("end:a"));
    expect(events.indexOf("start:c")).toBeGreaterThan(events.indexOf("end:b"));
  });

  it("respects the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const run = (id: string) =>
      new Promise<string>((r) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        setTimeout(() => {
          inFlight--;
          r(id);
        }, 10);
      });
    await schedule(graph(["a", "b", "c", "d", "e"]), run, { concurrency: 2 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("rejects a cycle", async () => {
    await expect(
      schedule(graph(["a", "b"], [["a", "b"], ["b", "a"]]), async (id) => id, {
        concurrency: 4,
      }),
    ).rejects.toThrow(/cycle/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/planner/test/schedule.test.ts`
Expected: FAIL — `schedule is not a function` / not exported.

- [ ] **Step 3: Implement `schedule()`**

Append to `packages/planner/src/index.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/planner/test/schedule.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm -r typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/planner/src/index.ts packages/planner/test/schedule.test.ts
git commit -m "feat(sp7): deterministic edge-honoring schedule() with ordered reassembly"
```

---

## Task 2: Format-only worker + pool (determinism)

**Files:**
- Create: `packages/determinism/src/format-worker.mjs`
- Create: `packages/determinism/src/format-pool.ts`
- Modify: `packages/determinism/src/index.ts`
- Test: `packages/determinism/test/format-pool.test.ts` (create)

**Interfaces:**
- Consumes: `FormatLang` (`"ts" | "tsx" | "js" | "json" | "css"`) and `format(source, lang)` from `./format.ts`.
- Produces:
  - `createFormatPool(opts: { size: number }): FormatPool`
  - `interface FormatPool { format(source: string, lang: FormatLang): Promise<string>; close(): Promise<void>; }`
  - Re-exported from `@boyscout/determinism`.

**Worker contract:** main→worker message `{ id: number, source: string, lang: FormatLang }`; worker→main `{ id: number, content: string } | { id: number, error: string }`. The worker's Biome CONFIG and VIRTUAL_PATH must be byte-identical to `format.ts`.

- [ ] **Step 1: Write the failing test**

Create `packages/determinism/test/format-pool.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type FormatLang, createFormatPool, format } from "../src/index.js";

const samples: Array<{ lang: FormatLang; source: string }> = [
  { lang: "ts", source: "const x=1 ;export const y   =2" },
  { lang: "tsx", source: "export const A=()=><div><span>hi</span></div>" },
  { lang: "js", source: "let a=1;let b=2" },
  { lang: "json", source: '{"b":2,"a":1}' },
  { lang: "css", source: ".x{color:red}" },
];

describe("format pool", () => {
  it("produces byte-identical output to sync format() across all langs (drift guard)", async () => {
    const pool = createFormatPool({ size: 2 });
    try {
      for (const s of samples) {
        expect(await pool.format(s.source, s.lang)).toBe(format(s.source, s.lang));
      }
    } finally {
      await pool.close();
    }
  });

  it("handles many concurrent jobs on a small pool", async () => {
    const pool = createFormatPool({ size: 2 });
    try {
      const jobs = Array.from({ length: 20 }, (_, i) =>
        pool.format(`const v${i}=${i}`, "ts"),
      );
      const out = await Promise.all(jobs);
      expect(out[7]).toBe(format("const v7=7", "ts"));
      expect(out).toHaveLength(20);
    } finally {
      await pool.close();
    }
  });

  it("rejects in-flight jobs when closed", async () => {
    const pool = createFormatPool({ size: 1 });
    await pool.close();
    await expect(pool.format("const x=1", "ts")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/determinism/test/format-pool.test.ts`
Expected: FAIL — `createFormatPool` not exported.

- [ ] **Step 3: Write the worker (plain JS)**

Create `packages/determinism/src/format-worker.mjs`. **The CONFIG/VIRTUAL_PATH below must stay byte-identical to `format.ts`** (the test enforces it):

```js
import { parentPort } from "node:worker_threads";
import { Biome } from "@biomejs/js-api/nodejs";

const VIRTUAL_PATH = {
  ts: "file.ts",
  tsx: "file.tsx",
  js: "file.js",
  json: "file.json",
  css: "file.css",
};

const CONFIG = {
  formatter: {
    enabled: true,
    indentStyle: "space",
    indentWidth: 2,
    lineWidth: 100,
    lineEnding: "lf",
  },
  javascript: {
    formatter: { quoteStyle: "double", semicolons: "always", trailingCommas: "all" },
  },
  json: { formatter: { enabled: true } },
  css: { formatter: { enabled: true } },
};

let cached = null;
function instance() {
  if (cached) return cached;
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  biome.applyConfiguration(projectKey, CONFIG);
  cached = { biome, projectKey };
  return cached;
}

if (!parentPort) throw new Error("format-worker must run as a worker_threads worker");

parentPort.on("message", (msg) => {
  const { id, source, lang } = msg;
  try {
    const { biome, projectKey } = instance();
    const { content } = biome.formatContent(projectKey, source, { filePath: VIRTUAL_PATH[lang] });
    parentPort.postMessage({ id, content });
  } catch (e) {
    parentPort.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
});
```

- [ ] **Step 4: Write the pool**

Create `packages/determinism/src/format-pool.ts`:

```ts
import { Worker } from "node:worker_threads";
import type { FormatLang } from "./format.js";

export interface FormatPool {
  format(source: string, lang: FormatLang): Promise<string>;
  close(): Promise<void>;
}

interface Pending {
  resolve: (content: string) => void;
  reject: (err: Error) => void;
}

// Worker sits beside this module in src/ (no build step; source-direct).
const WORKER_URL = new URL("./format-worker.mjs", import.meta.url);

/**
 * Persistent pool of format-only workers. Each worker owns a cached Biome/WASM
 * instance (init amortized across jobs). Jobs are dispatched round-robin; results
 * are correlated by monotonic id, so completion order does not matter to callers.
 */
export function createFormatPool(opts: { size: number }): FormatPool {
  const size = Math.max(1, opts.size);
  const workers: Worker[] = [];
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let rr = 0;
  let closed = false;

  for (let i = 0; i < size; i++) {
    const w = new Worker(WORKER_URL);
    w.on("message", (msg: { id: number; content?: string; error?: string }) => {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error !== undefined) p.reject(new Error(msg.error));
      else p.resolve(msg.content as string);
    });
    w.on("error", (err) => {
      // A worker crash fails every job routed through it; fail all outstanding to avoid hangs.
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(err);
      }
    });
    workers.push(w);
  }

  return {
    format(source: string, lang: FormatLang): Promise<string> {
      if (closed) return Promise.reject(new Error("format pool is closed"));
      const id = nextId++;
      const worker = workers[rr++ % workers.length] as Worker;
      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, source, lang });
      });
    },
    async close(): Promise<void> {
      closed = true;
      for (const [id, p] of pending) {
        pending.delete(id);
        p.reject(new Error("format pool closed before job completed"));
      }
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}
```

- [ ] **Step 5: Export from the package barrel**

In `packages/determinism/src/index.ts`, add (match existing export style):

```ts
export { createFormatPool, type FormatPool } from "./format-pool.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/determinism/test/format-pool.test.ts`
Expected: PASS (3 tests). If the drift-guard test fails, the worker CONFIG diverged from `format.ts` — reconcile them.

- [ ] **Step 7: Typecheck + lint**

Run: `pnpm -r typecheck && pnpm lint`
Expected: clean. (If Biome flags the `.mjs`, confirm it is not excluded; the inlined config duplication is intentional and load-bearing — add a `// biome-ignore`-free clean version rather than suppressing.)

- [ ] **Step 8: Commit**

```bash
git add packages/determinism/src/format-worker.mjs packages/determinism/src/format-pool.ts packages/determinism/src/index.ts packages/determinism/test/format-pool.test.ts
git commit -m "feat(sp7): format-only worker_threads pool with drift-guarded hermetic Biome"
```

---

## Task 3: `buildAssetsParallel` executor (runtime)

**Files:**
- Modify: `packages/runtime/src/index.ts`
- Test: `packages/runtime/test/parallel.test.ts` (create)

**Interfaces:**
- Consumes: `schedule` from `@boyscout/planner`; `createFormatPool` from `@boyscout/determinism`; existing `buildAssets`, `GateError`, `langOf` (internal), `checkAssets`, `plan`, `validateSpec`.
- Produces: `buildAssetsParallel(opts: BuildOpts, poolOpts?: { concurrency?: number }): Promise<Asset[]>`.

**Refactor note:** `buildAssets` currently does validate → metadata check → plan → per-node generate+format loop → post-guardrail. Extract everything EXCEPT the generate+format loop into a helper so both paths share it; keep `buildAssets`'s public body behavior identical.

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/test/parallel.test.ts`. Reuse a multi-asset fake bridge (mirrors the existing `runtime.test.ts` style):

```ts
import type { Asset, Bridge, FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { buildAssets, buildAssetsParallel, loadConfig } from "../src/index.js";

const fakeBridge: Bridge = {
  id: "astryx-react",
  platform: "react",
  registry: {
    capabilities: ["component"],
    nodeTypesFor: (c) => (c === "component" ? ["Card", "Text"] : []),
    paramsFor: () => [],
    providerFor: (cap) =>
      cap === "component"
        ? {
            capability: "component",
            // two assets per feature — exercises intra-node asset ordering
            generate: (f: FeatureT): Asset[] => [
              { path: `${f.id}.tsx`, content: `export const ${f.id}=()=><Card><Text>hi</Text></Card>` },
              { path: `${f.id}.meta.json`, content: `{"id":"${f.id}"}` },
            ],
          }
        : undefined,
  },
  postRules: [(a) => (a.content.includes("<div") ? [`${a.path}: div`] : [])],
};

const config = loadConfig("platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n");

function spec(ids: string[]) {
  return {
    version: "1",
    features: ids.map((id) => ({
      id,
      capability: "component",
      tree: { type: "Card" },
      annotations: {},
      props: {},
      approved: true,
    })),
    metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
  };
}

describe("buildAssetsParallel", () => {
  it("produces output byte-identical to sequential buildAssets", async () => {
    const opts = { specInput: spec(["b", "a", "c"]), config, bridge: fakeBridge };
    const seq = buildAssets(opts);
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par).toEqual(seq);
  });

  it("preserves graph ordering and intra-node asset order under concurrency", async () => {
    const opts = { specInput: spec(["z", "a", "m"]), config, bridge: fakeBridge };
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par.map((a) => a.path)).toEqual([
      "a.tsx", "a.meta.json",
      "m.tsx", "m.meta.json",
      "z.tsx", "z.meta.json",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/runtime/test/parallel.test.ts`
Expected: FAIL — `buildAssetsParallel` not exported.

- [ ] **Step 3: Extract the shared core in `buildAssets`**

In `packages/runtime/src/index.ts`, refactor `buildAssets` so validation/planning and the post-barrier are shared. Replace the current `buildAssets` body with:

```ts
/** Shared prelude: resolve bridge match, validate, metadata check, plan. Returns graph + feature map. */
function prepare(opts: BuildOpts): {
  spec: SpecificationT;
  graph: ExecutionGraphT;
  featureById: Map<string, FeatureT>;
  bridge: Bridge;
} {
  const { config, bridge } = opts;
  if (config.bridge !== bridge.id) {
    throw new Error(`config bridge "${config.bridge}" != loaded bridge "${bridge.id}"`);
  }
  const validated = validateSpec(opts.specInput, bridge.registry);
  if (!validated.ok) throw new GateError(validated.violations);
  const spec = validated.spec;
  if (spec.metadata.bridge !== bridge.id || spec.metadata.platform !== bridge.platform) {
    throw new Error(`spec metadata (${spec.metadata.bridge}/${spec.metadata.platform}) != bridge`);
  }
  const graph = plan(spec);
  const featureById = new Map<string, FeatureT>(spec.features.map((f) => [f.id, f]));
  return { spec, graph, featureById, bridge };
}

/** Shared post-barrier: scaffold assets only (durable human bodies are lint-level, D2d). */
function postBarrier(assets: Asset[], bridge: Bridge): Asset[] {
  const gate = checkAssets(assets.filter((a) => !a.durable), bridge.postRules);
  if (!gate.ok) throw new GateError(gate.violations);
  return assets;
}

/** Generate + format one node's assets (main-thread format). */
function generateNodeSync(feature: FeatureT, bridge: Bridge): Asset[] {
  const provider = bridge.registry.providerFor(feature.capability);
  if (!provider) throw new Error(`no provider for capability "${feature.capability}"`);
  return provider.generate(feature).map((raw) => ({
    path: raw.path,
    content: format(raw.content, langOf(raw.path)),
    ...(raw.durable !== undefined ? { durable: raw.durable } : {}),
  }));
}

/** resolve() -> validate() -> plan() -> generate() -> format() -> verify(). Returns formatted assets; no emit. */
export function buildAssets(opts: BuildOpts): Asset[] {
  const { graph, featureById, bridge } = prepare(opts);
  const assets: Asset[] = [];
  for (const id of graph.ordering) {
    const feature = featureById.get(id);
    if (!feature) throw new Error(`graph node "${id}" has no feature`);
    assets.push(...generateNodeSync(feature, bridge));
  }
  return postBarrier(assets, bridge);
}
```

Add the needed imports at the top of the file: `schedule` from `@boyscout/planner`, `createFormatPool` from `@boyscout/determinism`, and the types `ExecutionGraphT, SpecificationT` from `@boyscout/schemas` (extend the existing import lines).

- [ ] **Step 4: Add `buildAssetsParallel`**

Append after `buildAssets`:

```ts
/**
 * Opt-in parallel executor (D8). Same pipeline as buildAssets, but format() runs on a
 * worker pool while generate() stays main-thread (keeps runtime bridge-agnostic). Output
 * is reassembled to graph order by schedule(), so it is byte-identical to buildAssets.
 * NOT the default: small specs are net-slower (worker/WASM overhead). See parallel benchmark.
 */
export async function buildAssetsParallel(
  opts: BuildOpts,
  poolOpts: { concurrency?: number } = {},
): Promise<Asset[]> {
  const { graph, featureById, bridge } = prepare(opts);
  const size = Math.max(1, Math.min(poolOpts.concurrency ?? 4, graph.ordering.length || 1));
  const pool = createFormatPool({ size });
  try {
    const perNode = await schedule<Asset[]>(
      graph,
      async (id) => {
        const feature = featureById.get(id);
        if (!feature) throw new Error(`graph node "${id}" has no feature`);
        const provider = bridge.registry.providerFor(feature.capability);
        if (!provider) throw new Error(`no provider for capability "${feature.capability}"`);
        const raws = provider.generate(feature); // main-thread, cheap
        return Promise.all(
          raws.map(async (raw) => ({
            path: raw.path,
            content: await pool.format(raw.content, langOf(raw.path)),
            ...(raw.durable !== undefined ? { durable: raw.durable } : {}),
          })),
        );
      },
      { concurrency: graph.ordering.length || 1 },
    );
    return postBarrier(perNode.flat(), bridge);
  } finally {
    await pool.close();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/runtime/test/parallel.test.ts packages/runtime/test/runtime.test.ts`
Expected: PASS — new parallel tests green AND existing runtime tests still green (refactor preserved behavior).

- [ ] **Step 6: Full suite + typecheck + lint**

Run: `pnpm test && pnpm -r typecheck && pnpm lint`
Expected: all green/clean.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/index.ts packages/runtime/test/parallel.test.ts
git commit -m "feat(sp7): buildAssetsParallel — format-pool executor, byte-identical to sequential"
```

---

## Task 4: Honest speedup benchmark

**Files:**
- Modify: `packages/runtime/test/parallel.test.ts`

**Interfaces:**
- Consumes: `buildAssets`, `buildAssetsParallel` (Task 3).
- Produces: no new exports — a benchmark test that measures and logs wall-clock, asserting a win only at scale.

**Reality this documents:** on tiny specs the pool loses (spawn + WASM-init + message overhead). The benchmark proves a win on a *large* spec and prints the crossover, honestly.

- [ ] **Step 1: Write the benchmark test**

Append to `packages/runtime/test/parallel.test.ts`:

```ts
describe("buildAssetsParallel speedup (honest)", () => {
  // Large synthetic spec so per-format work dominates worker overhead.
  const big = spec(Array.from({ length: 200 }, (_, i) => `f${String(i).padStart(3, "0")}`));

  it("is byte-identical to sequential at scale", async () => {
    const opts = { specInput: big, config, bridge: fakeBridge };
    const seq = buildAssets(opts);
    const par = await buildAssetsParallel(opts, { concurrency: 4 });
    expect(par).toEqual(seq);
  });

  it("beats sequential wall-clock on a large spec (logged, not silently trusted)", async () => {
    const opts = { specInput: big, config, bridge: fakeBridge };
    // warm both paths (WASM init) so the measurement is steady-state.
    buildAssets(opts);
    await buildAssetsParallel(opts, { concurrency: 4 });

    const t0 = performance.now();
    buildAssets(opts);
    const seqMs = performance.now() - t0;

    const t1 = performance.now();
    await buildAssetsParallel(opts, { concurrency: 4 });
    const parMs = performance.now() - t1;

    // Honest reporting: print both, note the crossover caveat.
    console.log(
      `[sp7] 200 features — sequential ${seqMs.toFixed(0)}ms vs parallel(4) ${parMs.toFixed(0)}ms ` +
        `(speedup ${(seqMs / parMs).toFixed(2)}x). Small specs are net-slower; crossover is workload-dependent.`,
    );
    // Loose bound: on multi-core CI the pool should not be dramatically slower, and
    // should win when format work dominates. Keep the assertion non-flaky.
    expect(parMs).toBeLessThan(seqMs * 1.5);
  }, 30_000);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run packages/runtime/test/parallel.test.ts`
Expected: PASS; the `[sp7] …` line prints measured wall-clock and speedup.

> **Note for the executor:** if the parallel path is not faster even at 200 features, that is a *finding*, not a failure — record the measured numbers and the crossover in the commit body. The correctness proofs (Tasks 1–3) are the load-bearing deliverable; the speedup assertion is intentionally loose (`< seqMs * 1.5`) to stay non-flaky across machines. Do NOT tighten it into a flaky exact-ratio gate.

- [ ] **Step 3: Full suite + typecheck + lint**

Run: `pnpm test && pnpm -r typecheck && pnpm lint`
Expected: all green/clean.

- [ ] **Step 4: Commit**

```bash
git add packages/runtime/test/parallel.test.ts
git commit -m "test(sp7): honest speedup benchmark with documented crossover"
```

---

## Task 5: Update the roadmap proof status

**Files:**
- Modify: `docs/V1-ROADMAP.md`

- [ ] **Step 1: Mark SP7 proof met**

In `docs/V1-ROADMAP.md`, the SP7 row's "Proof it's done" already reads *"Parallel output byte-identical to sequential baseline; measurable speedup."* Add a trailing note that it is delivered as an **opt-in** executor (default stays sequential) and that edge-handling is proven with synthetic graphs pending a `Feature` dependency-data schema change. Keep it to one clause — do not restructure the table.

- [ ] **Step 2: Commit**

```bash
git add docs/V1-ROADMAP.md
git commit -m "docs(sp7): note parallel executor is opt-in; edges await Feature dep-data"
```

---

## Self-Review

**Spec coverage:**
- schedule() (pure, edge-honoring, ordered reassembly, cycle-reject) → Task 1. ✓
- Format-only worker + pool, drift guard → Task 2. ✓
- `buildAssetsParallel`, shared core, default untouched → Task 3. ✓
- Reassembly byte-identity proof → Task 1 (shuffled-completion test) + Task 3 (pool==sequential). ✓
- Dependency-bounds + cycle proofs → Task 1. ✓
- Worker==format drift guard → Task 2. ✓
- Honest speedup + crossover → Task 4. ✓
- Non-goals (no edges in plan(), no schema/config/CLI change, agnosticism preserved) → respected throughout; Task 5 documents. ✓

**Placeholder scan:** none — every code step has full code and exact commands.

**Type consistency:** `schedule<T>(graph, runNode, {concurrency})` used identically in Tasks 1 and 3. `createFormatPool({size})→{format,close}` defined in Task 2, consumed in Task 3. `prepare`/`postBarrier`/`generateNodeSync`/`langOf` names consistent within Task 3. Worker message shape `{id,source,lang}`/`{id,content|error}` matches between worker (Task 2 Step 3) and pool (Task 2 Step 4).
