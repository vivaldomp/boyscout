# SP2 — Headless Declarative Generation (Design)

> Second sub-project of the v1 roadmap (`docs/V1-ROADMAP.md`) and the **kill-gate**. Builds the headless walking skeleton that proves the two central bets — cross-OS byte-identity (D3b) *and* headless governance (§10) — before any front-end, second bridge, or E2E is built. Consumes SP1 (`@boyscout/determinism`, `@boyscout/schemas`, merged). References architecture decisions **D1–D10** in `docs/FIRST-SPEC.md`.

## Goal & kill-gate

Prove **both halves of the core bet, headless**, on one capability:

- A hand-authored `boyscout-spec.json` → **byte-identical `component` output on Linux, macOS, and Windows** in CI (determinism thesis, **D3b**).
- A guardrail violation **fails the gate with 422** at **both** barriers — pre-generation restriction and post-generation AST/lint proof (governance thesis, §10).

**Done-criteria:** `boyscout generate` turns a fixture spec into an Astryx React component in `.running/`, golden-tested cross-OS; a spec referencing an unknown component 422s at `validate()`; a violating asset 422s at `verify()`.

If both hold after SP2, the core architecture is proven and everything downstream is "build the specified surface." If either fails, the spend is ~2 sub-projects, not 8 (the entire payoff of the roadmap ordering — **kill-gate: SP2**).

## Decided context (this design's forks, resolved)

| Fork | Decision |
|---|---|
| What is "Astryx" | The **real** `@astryxdesign/core` package (facebook/astryx — React + StyleX design system), pinned exactly. Not synthetic. |
| Guardrail scope | **Both barriers**, minimal each (pre-gen expressibility + post-gen AST/lint). The double barrier is the product thesis; the kill-gate proves it honestly. |
| Package boundaries | **Full split per §19.2** — separate agnostic `spec`/`planner`/`codegen`/`guardrails`/`runtime` packages + `bridge-astryx-react` + `apps/cli`. SP3/SP4/SP6 slot in with no re-split. |
| Config parsing | `yaml` (pinned) for `boyscout.config.yaml`. |
| Post-barrier rule | **Design-system enforcement** (emitted JSX uses only Astryx components), not a generic lint rule — a meaningful §10 governance rule. |

## Package layout (full split, §19.2)

```
packages/
  spec/                    @boyscout/spec        — Zod shape-validation + 422 gate (validateSpec)
  planner/                 @boyscout/planner     — Specification -> ExecutionGraph (sequential; byte-collation tie-break)
  codegen/                 @boyscout/codegen      — generic Eta execution engine (pinned, autoEscape:false); agnostic
  guardrails/              @boyscout/guardrails  — double-barrier engine (pre: expressibility; post: Biome AST/lint)
  runtime/                 @boyscout/runtime     — orchestrates load->...->emit; imports core, NEVER the bridge
  bridges/
    bridge-astryx-react/   @boyscout/bridge-astryx-react — Registry + `component` Provider + Eta templates + guardrail rules
apps/cli/                  boyscout generate
```

**Enforced invariant (the agnosticism proof, §14.1):** `@boyscout/runtime` and all core packages have **zero** dependency on `bridge-astryx-react` or `@astryxdesign/core`. The runtime resolves a bridge by an **interface** (a `Bridge` contract), passed in at `resolve()` — never imported. A test asserts the runtime package's resolved dependency closure contains no `astryx`. That structural fact *is* the proof the core knows no framework.

## `@boyscout/spec` — validation & 422 gate

- `validateSpec(spec, registry)`: Zod shape-validation of `Specification` (SP1 schema) **plus** the pre-generation barrier delegated to `@boyscout/guardrails`.
- Returns a validated spec or a structured 422 (`GuardrailResult { ok:false, violations[], code:422 }`, SP1 schema).
- Reused widely downstream (SP4 authoring gate), which is why it is its own package.

## `@boyscout/planner` — deterministic Execution Graph

- `plan(spec, config, registry) -> ExecutionGraph` (SP1 schema: `{ nodes[{id,capability}], edges[], ordering[] }`).
- SP2 scope: **one node per feature**, sequential. No cross-feature edges yet.
- Ordering uses **byte-collation tie-break** (SP1 `sortByBytes`) — lexicographic by node id. Serialized with `canonicalJson`.
- **Deterministic:** same inputs -> identical serialized graph. No randomness, no model inference. (Parallel execution is **D8/SP7**, explicitly deferred.)

## `@boyscout/codegen` — generic Eta engine (agnostic)

- `render(template, data) -> string`: runs **Eta** (pinned, `autoEscape:false`) with the supplied data. Framework-agnostic — knows nothing about React, JSX, or Astryx.
- The engine only interpolates; **all logic lives in the Provider** (§14.2 "templates never contain business logic").

## `@boyscout/guardrails` — the double barrier

- **Pre-barrier** `checkExpressible(spec, registry) -> GuardrailResult`: every `AstNode.type` in every feature's tree must exist in the Registry catalog. An unknown type (`"Blob"`) -> `{ ok:false, code:422 }`. Restriction at the source: a non-Astryx component is not representable.
- **Post-barrier** `checkAssets(assets, rules) -> GuardrailResult`: runs the **pinned Biome analyzer** (same pinned Biome as the SP1 formatter — one tool for format + lint, §10/§11.3) over formatted assets, plus the bridge's **design-system rule** (emitted JSX contains only Astryx components — no bare intrinsic elements). Any error-level violation -> `{ ok:false, code:422 }`.
- Rules are **injected by the bridge**; the engine is agnostic.

## `@boyscout/runtime` — protocol orchestrator (sequential, single capability)

`load() -> resolve() -> plan() -> validate() -> generate() -> format() -> verify() -> emit()`

| Stage | SP2 behavior |
|---|---|
| `load()` | Parse `boyscout.config.yaml` (pinned `yaml`). Fail-fast on invalid config. |
| `resolve()` | Load the bridge via the `Bridge` interface; expose its Registry. Verify `bridge`/`platform` match the spec's `metadata`. |
| `plan()` | `@boyscout/planner`: one node per feature; ordering via byte-collation tie-break; graph serialized with `canonicalJson`. |
| `validate()` | `@boyscout/spec` Zod gate **+ pre-barrier** (`@boyscout/guardrails`). Violation -> **422**, halt. |
| `generate()` | Bridge Provider walks each feature's AST and produces raw TSX via `@boyscout/codegen` + the bridge's Eta template. |
| `format()` | SP1 `format(src, "tsx")` — hermetic pinned Biome (ambient config discovery disabled). |
| `verify()` | **Post-barrier** (`@boyscout/guardrails`): pinned Biome analysis + design-system rule over formatted assets. Violation -> **422**, halt. |
| `emit()` | **Disposable mode only (D2b):** write to `.running/` via SP1 `writeBytes` (LF/UTF-8/no-BOM, fixed final newline). Path-traversal shielded; confined to `.running/`. (Durable `src/` create-if-absent emit = **SP3**.) |

**Invariants:** every stage is a pure function of its inputs until `emit()`; the pipeline is fail-fast; the runtime never inspects asset content for framework-specific patterns (that is the bridge's job via injected rules).

## `@boyscout/bridge-astryx-react` — the framework knowledge

- **Dependency:** `@astryxdesign/core` (React + StyleX), pinned exactly, **in the bridge only**.
- **Registry:** declares the `component` capability (tier `declarative`, satisfying SP1's `CapabilityContract`) and a **catalog** mapping `AstNode.type` -> Astryx component **1:1**, each with a Zod prop schema. SP2 catalog subset:

  | AstNode.type | Astryx component | Props (SP2) |
  |---|---|---|
  | `VStack` / `HStack` | `VStack` / `HStack` | `gap` |
  | `Card` | `Card` | — |
  | `Grid` | `Grid` | `columns`, `gap` |
  | `Heading` | `Heading` | `level`, `text` |
  | `Text` | `Text` | `type`, `text` |
  | `Button` | `Button` | `variant`, `text` |

  (Text-bearing leaves carry their text in a `text` prop, rendered as the JSX child. The catalog is trivially extensible — more Astryx components are added as Registry rows.)

- **Provider (`component`):** walks the `Feature.tree` recursively (recursion = logic, lives here, not the template), producing the imports block, the rendered nested JSX body, and the PascalCase component name (from `Feature.id`). Hands those to the Eta template.
- **Eta template (`component.tsx.eta`):** a dumb skeleton — `import { <%= imports %> } from "@astryxdesign/core";` + `export function <%= name %>() { return (<%= body %>); }`. Zero logic. Biome normalizes whitespace afterward.
- **Guardrail rules:** contributes the pre-barrier catalog membership check and the post-barrier design-system rule.

**Output example** (`.running/UserCard.tsx`, post-format):

```tsx
import { Card, VStack, Heading, Text } from "@astryxdesign/core";

export function UserCard() {
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={3}>Profile</Heading>
        <Text type="body">Member since 2026</Text>
      </VStack>
    </Card>
  );
}
```

## Determinism integration (nothing re-implemented)

All serialize/sort/format/write routes through SP1's `@boyscout/determinism` — the only sanctioned path (**D3a**):

- Execution Graph serialized with `canonicalJson`.
- `metadata.checksum` = `hash(canonicalJson(spec without checksum field))`.
- Every emitted file: `format()` then `writeBytes()`.
- Every collection feeding output ordered with `sortByBytes`.

The **only** new byte surface is Eta's raw output — and it is immediately normalized by `format()`, so Eta whitespace cannot introduce drift.

## `apps/cli` — `boyscout generate`

`boyscout generate [--spec ./boyscout-spec.json] [--config ./boyscout.config.yaml]`

- Thin entry that calls `@boyscout/runtime`. Runs the full protocol, writes `.running/`, prints emitted paths.
- Exits non-zero on any 422 or structured error.
- No daemon, no HTTP, no SSE — that is **SP4** (Hono + §21 security land there).

## Error handling

- Fail-fast per stage with a structured error carrying the stage name and reason.
- Guardrail violations surface as `GuardrailResult { ok:false, violations[], code:422 }` and halt before `emit()`.
- `emit()` shields against path traversal (`..`) and confines writes to `.running/`.

## Testing (Vitest + cross-OS golden)

- **Golden cross-OS (the thesis):** fixture spec -> `.running/` output, snapshot-compared via `hash()` of emitted bytes, run on SP1's existing `{ubuntu, macos, windows} x node20` CI matrix. **Byte-identity across all three OSes is the pass condition.** The formatter is the long-pole target.
- **Governance negatives (the kill-gate's second half):** (a) a spec with an unknown component type -> **422 at `validate()`**; (b) a crafted violating asset (bare `<div>`) -> **422 at `verify()`**.
- **Registry contract test (§8.4):** every catalog component actually exists as an export of `@astryxdesign/core` (import-and-assert) — fails the build on Astryx drift.
- **Planner determinism:** same spec -> identical serialized Execution Graph; ordering tie-break is byte-stable.
- **Agnosticism guard:** `@boyscout/runtime`'s resolved dependency closure contains no `astryx` — the structural agnosticism proof.
- **Protocol unit tests:** each stage's contract (pure until `emit()`, fail-fast on bad input).

## Risks

- **Biome cross-OS byte-stability** remains the one real determinism risk (the D3b long-pole). SP1 already proved the primitives cross-OS; SP2 extends the golden matrix to generated `.tsx` output — a larger, JSX-shaped input for the same formatter.
- **Astryx API drift:** `@astryxdesign/core` is young (0.1.x). Pinned exactly + the Registry contract test catches drift at build time.

## Not in SP2 (deferred to later sub-projects)

- Logic-bearing tier + durable `src/` create-if-absent seam (**SP3**).
- Parallel execution + deterministic reassembly (**D8/SP7**).
- Authoring front-end: `.openui` DSL round-trip, `<Renderer/>` preview, questionnaire, SSE, approval UI, Hono daemon + §21 security (**SP4/SP5**).
- Second bridge (Material/Angular) — the agnosticism go-to-market proof (**SP6**).
- `boyscout.lock` full transitive closure (**SP8**).
- Reusing Astryx's own `@astryxdesign/cli` `json`/`template`/`codemod` API for authoring (later, if ever — the Runtime cannot call it without importing framework knowledge).
