# SP3 — Logic-Bearing Tier & Durable Seam (Design)

> Third sub-project of the v1 roadmap (`docs/V1-ROADMAP.md`). SP2 proved the **declarative** tier (component → disposable `.running/`) and retired the kill-gate. SP3 builds the **logic-bearing** tier and its hardest piece — the **durable seam**: a governed, deterministic scaffold bound by a **typed contract** to a **human-owned logic file** created **create-if-absent** in `src/` and never regenerated. Headless throughout (no front-end — that is SP4). Consumes SP1 (`@boyscout/determinism`, `@boyscout/schemas`) and SP2 (all core packages + `bridge-astryx-react` + `apps/cli`, merged). References architecture decisions **D1–D10** in `docs/FIRST-SPEC.md`.

## Goal & done-proofs

Prove the durable-seam mechanism headlessly across the full logic-bearing tier (`service`, `store`, `http`):

- **Scaffold → `.running/` + stub → `src/` (create-if-absent).** `emit()` gains its second mode (**D2b**).
- **Regen preserves the human file.** A second `generate` overwrites the scaffold identically but never touches an existing `src/` stub.
- **Signature drift → compile error.** The generated scaffold binds the human impl with a spec-derived typed contract; a mismatched human file fails `tsc`.
- **Golden covers scaffold only.** Cross-OS byte-identity is asserted on `.running/`; durable `src/` is outside the determinism boundary (**D2b/§11.2**).

If these hold, the second capability tier and the seam are proven, and the remaining sub-projects (SP4+) build surface, not new engine architecture.

## Decided context (this design's forks, resolved)

| Fork | Decision |
|---|---|
| Tier breadth | **All three** logic-bearing capabilities — `service`, `store`, `http` — each with its distinct React idiom. Proves the one seam pattern generalizes across idioms. |
| Seam pattern | **Pattern (A):** the `.running/` scaffold owns the spec-derived typed contract and **depends on** the human `src/` leaf via a stable spec-derived import; the durable file imports nothing generated. Dependency points disposable → durable (correct direction; matches §11.2). Rejected: (B) abstract-base/subclass (OOP, un-React-idiomatic for hooks/fetch), (C) human `satisfies` a type imported from `.running/` (inverts the dependency; durable file breaks when `.running/` is cleaned). |
| Governance of durable bodies | Post-barrier (**verify()**) runs on **scaffold assets only**. Human logic bodies get **compiler-enforced contract** + lint-level rules (**D2d/§10**); they are create-if-absent and never re-verified. |
| Contract-token authoring | Signature/type tokens are **author-supplied strings**, interpolated verbatim — a headless-fixture simplification. Untrusted-input escaping is the tracked SP4 prerequisite. |

## Package layout (extends SP2 — no re-split)

```
packages/
  schemas/                 + Asset.durable flag; BridgeRegistry.nodeTypesFor()  (SeamContract already exists, SP1)
  guardrails/              + checkExpressible capability-scoped; checkAssets scaffold-only
  runtime/                 + emit() durable mode (create-if-absent → src/)
  bridges/
    bridge-astryx-react/   + service / store / http Providers, 6 Eta templates, 3 SeamContracts, registry rows
apps/cli/                  (unchanged — boyscout generate already runs the full protocol)
```

**Agnosticism invariant preserved (§14.1):** every new piece of framework knowledge (the three idioms, React hook wiring, the seam mechanism) lives in `bridge-astryx-react`. `@boyscout/runtime` and all core packages remain structurally free of `astryx`/`react` — the existing agnosticism guard test still passes. React types appear only inside the bridge's `store` scaffold.

## Schema changes (`@boyscout/schemas`)

**`Asset` gains a durability flag:**
```ts
interface Asset { path: string; content: string; durable?: boolean } // default false = scaffold
```
- `durable:false` (default) → `.running/`, overwrite, governed, deterministic, golden-tested.
- `durable:true` → `src/`, create-if-absent, human-owned, outside the determinism boundary.

**`BridgeRegistry` generalizes vocabulary per capability:**
```ts
interface BridgeRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];   // replaces the flat componentTypes
  providerFor(capability: string): Provider | undefined;
}
```
A `service` feature's `tree` speaks `Service`/`Method`; a `store` speaks `Store`/`Action`; an `http` speaks `Http`/`Endpoint` — not the component catalog. The pre-barrier must check each feature against **its** capability's vocabulary. `component` becomes `nodeTypesFor("component")`, returning the existing catalog. `SeamContract` (`srcPath`, `typedSignature`, `binding`) already exists from SP1 — no change.

## Guardrails changes (`@boyscout/guardrails`)

- **Pre-barrier `checkExpressible` becomes capability-scoped.** For each feature: resolve its `capability` in the registry — an unknown capability → `{ ok:false, code:422 }`. Then check every `AstNode.type` in the feature's tree against `nodeTypesFor(capability)`. Unknown node type → 422. (SP2 behavior is the `component` special case of this.)
- **Post-barrier `checkAssets` runs on scaffold assets only.** The runtime filters `!durable` before calling it. Durable stubs are human logic bodies: compiler-enforced contract + lint-level (**D2d**), create-if-absent, never re-verified.

## Runtime changes (`@boyscout/runtime`)

`emit()` routes by `asset.durable`:

| Asset | Target | Policy |
|---|---|---|
| scaffold (`durable:false`) | `<outDir>/.running/<path>` | `writeBytes` overwrite, idempotent (existing SP2 behavior) |
| durable (`durable:true`) | `<outDir>/src/<path>` | **if the file exists → skip (preserve human file); else mkdir + `writeBytes`** |

Path-traversal guard (`..` / non-normalized / absolute) applies to **both** targets. `buildAssets()`'s `verify()` step filters to scaffold assets before the post-barrier; `format()` still runs over all assets (Biome is deterministic, so formatting a stub once on create is harmless). `GenerateResult` distinguishes emitted scaffolds from created/preserved durables so the CLI can report "created stub" vs "preserved".

## Bridge: the three logic-bearing Providers

Each Provider is `tier:"logic-bearing"`, emits **two assets** (scaffold + durable stub), and declares a `SeamContract`. The spec author expresses the **contract shape**; the human writes the **bodies** (D2a: AI=what, runtime=how-of-construction, human=how-of-behavior).

**Feature shape (example — `service`):**
```json
{ "id": "user-service", "capability": "service", "tree": {
    "type": "Service", "props": { "name": "UserService" },
    "children": [ { "type": "Method",
      "props": { "name": "getUsers", "params": "", "returns": "Promise<User[]>" } } ]
} }
```

**`service` → two files:**
```ts
// .running/services/UserService.ts   (governed, deterministic, regenerated wholesale)
export interface UserServiceContract { getUsers(): Promise<User[]>; }
import { userService as impl } from "../../src/services/user-service.js";
export const userService: UserServiceContract = impl;   // ← signature drift errors HERE
```
```ts
// src/services/user-service.ts   (create-if-absent, human-owned, pure leaf — imports nothing generated)
export const userService = {
  async getUsers() { /* TODO: your logic */ return []; },
};
```

**`store`** — scaffold emits React hook wiring (`useReducer` + typed `State`/`Action` derived from the feature's actions); the human writes the reducer/action logic in `src/`. **`http`** — scaffold emits a typed fetch client (request/response types + fetch wiring); the human writes the response→domain **transform** functions in `src/`. All three share pattern (A): the scaffold's typed binding line is where drift surfaces; the `src/` leaf is standalone.

**Templates:** six dumb Eta templates (`service.ts.eta`, `store.ts.eta`, `http.ts.eta` for scaffolds; `service.impl.ts.eta`, `store.impl.ts.eta`, `http.impl.ts.eta` for stubs). Zero logic — all recursion/derivation lives in the Provider (§17.2). Signature/type tokens interpolated verbatim (author-supplied strings; escaping is the SP4 prerequisite).

**Registry rows:** `capabilities` gains `service`/`store`/`http`; `nodeTypesFor` returns each capability's vocabulary; `providerFor` returns the matching Provider. Each capability's `CapabilityContract` carries its `SeamContract` (spec-derived `srcPath`, `typedSignature`, `binding`).

## Determinism integration (nothing re-implemented)

- **Scaffolds**: full boundary — Execution Graph via `canonicalJson`, `format()` (hermetic pinned Biome), `writeBytes` (LF/UTF-8/no-BOM), golden cross-OS. Unchanged from SP2.
- **Durable stubs**: outside the boundary (**D2b/§11.2**). Formatted once on create, **never golden-tested, never re-emitted**. The scaffold's import specifier is spec-derived — a deterministic *reference* to a non-deterministic *referent*, exactly as §11.2 specifies.

## `apps/cli`

Unchanged mechanically — `boyscout generate` already runs the full protocol and emits whatever assets the providers return. Output reporting distinguishes emitted scaffolds from created/preserved `src/` stubs. No daemon/HTTP/SSE (that is SP4).

## Error handling

- Fail-fast per stage with a structured error (stage name + reason), as SP2.
- Durable emit **never throws on an existing file** — create-if-absent is the feature, not an error.
- Path-traversal guard rejects `..`/non-normalized/absolute paths for both `.running/` and `src/` targets before any write.
- Guardrail violations surface as `GuardrailResult { ok:false, violations[], code:422 }` and halt before `emit()`; post-barrier is scaffold-scoped.

## Testing (Vitest + cross-OS golden + TS compiler API)

| Test | Proves |
|---|---|
| **Golden cross-OS, `.running/` only** — fixture spec with `service`+`store`+`http` features → scaffolds snapshot-compared via `hash()` on the `{ubuntu,macos,windows}×node20` matrix; `src/` excluded | scaffold byte-identity across OSes (roadmap: "golden covers scaffold only") |
| **Regen preserves human file** — emit → stub created; mutate the stub; emit again → assert stub bytes unchanged **and** scaffold re-emitted identically | the durable-preserve half of D2b |
| **Create-if-absent** — emit into empty dir creates the stub; emit when it exists skips it | the mechanism behind regen-preserve |
| **Signature drift → compile error** — `ts.createProgram` (the `typescript` dep already used by `astryx-only.ts`) over a *matching* fixture (0 diagnostics) and a *drifted* fixture (contract-mismatch diagnostic); self-contained fixture types so `tsc` resolves without a project `tsconfig` | compiler-enforced governance of the human body (D2d) |
| **Pre-barrier per-capability 422** — a `service` feature with an unknown node type, and a feature with an unknown capability → 422 at `validate()` | capability-scoped restriction at the source (§10) |
| **Post-barrier scaffold 422** — a crafted violating scaffold → 422 at `verify()`; a durable stub with the same violation is skipped | scaffold-scoped post-barrier (D2d) |
| **Seam contract present** — each logic-bearing Registry entry declares a `SeamContract` with spec-derived `srcPath` | the seam is a declared Bridge contract clause (D2d) |
| **Agnosticism guard** (carried over) — `@boyscout/runtime`'s resolved closure contains no `astryx`/`react` | core knows no framework (§14.1) |
| **Registry contract** (carried over) — Astryx catalog components still exist as `@astryxdesign/core` exports | Astryx drift caught at build (§8.4) |

## Risks

- **The drift test is the one novel mechanism.** Kept honest by self-contained fixture types (no external imports) so the TS program resolves headlessly without a full tsconfig. If cross-file type resolution proves flaky, fall back to spawning `tsc --noEmit` over a temp fixture dir.
- **Author-supplied signature strings** are the deliberate simplification. Safe under headless fixtures; the escaping path is tracked as an SP4 prerequisite (untrusted authoring input). See `sp4-prerequisites`.
- **`store` pulls React types into the bridge.** Acceptable — React lives in the bridge tier, never in core; the agnosticism guard asserts core stays clean.

## Not in SP3 (deferred to later sub-projects)

- Authoring front-end: `.openui` DSL round-trip, `<Renderer/>` preview, questionnaire, SSE, approval UI, Hono daemon + §21 security (**SP4/SP5**).
- Second bridge (Material/Angular) — the agnosticism go-to-market proof, which will run this same logic-bearing contract suite (**SP6**).
- Parallel execution + deterministic reassembly (**D8/SP7**).
- `boyscout.lock` full transitive closure (**SP8**).
- Prop/text/signature escaping for untrusted authoring input (SP4 prerequisite).
