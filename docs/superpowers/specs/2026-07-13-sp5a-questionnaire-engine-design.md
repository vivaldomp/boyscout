# SP5a — `@boyscout/questionnaire`: Deterministic Composition Engine (headless) — Design

> Sub-project of BoyScout v1 (`docs/V1-ROADMAP.md`, decisions D1–D10 in `docs/FIRST-SPEC.md`). This is the **first half of SP5** (Guided Authoring, D9), split out so the fully headless piece — the deterministic questionnaire → `Specification` composition — is proven before the browser/streaming stack (SSE live workspace + questionnaire UI + annotations) is built on top of it. Mirrors the SP4a/SP4b split. Builds on merged SP1 + SP2 + SP3 + SP4a + SP4b.

## Goal

A new core package, `@boyscout/questionnaire`, that turns a **closed** deterministic questionnaire (YAML) plus a set of closed answers into a validated `Specification` — "no free inference" (§18.3). Same answers always yield the same spec bytes.

## Scope decision (why SP5a, not all of SP5)

SP5 (D9) bundles a headless engine (questionnaire + composition), a browser/streaming layer (SSE live workspace + Astryx-rendered questionnaire UI + per-node annotations UI), and full Playwright E2E. Following the proven SP4a/SP4b rhythm, SP5a delivers the headless engine alone — property- and golden-tested, no browser — so the deterministic composition contract is nailed before SP5b wires it into the SPA over SSE.

**In SP5a:** `@boyscout/questionnaire` — schema, `enabledWhen` evaluation, `compose()`, error contract, determinism + golden coverage.

**Deferred to SP5b / later:** the questionnaire UI (Astryx-rendered form), SSE live-workspace streaming, per-node annotations UI + context enrichment, CLI/daemon wiring and file discovery, Playwright E2E of the guided flow.

## Architecture — the key insight

`compose()` **assembles a `.openui` document from the selected fragments, then runs SP4a's existing `parseOpenui` → validated `Specification`.** The questionnaire's entire job is to *deterministically assemble `.openui` text from closed answers*; SP4a's proven `parse → bind → validate → serialize` pipeline does everything downstream. The composed spec is therefore round-trippable and byte-stable **by construction**, and the engine adds no new parser, validator, or determinism primitive.

```
answers ─▶ evaluate enabledWhen (single forward pass over declaration order)
        ─▶ collect the contributes fragments of every enabled + answered option
        ─▶ assemble a raw .openui document: header (bridge/platform) + one
           "<capability> <id> =\n  <tree-body>" block per fragment, in
           declaration order (question order, then option order)
        ─▶ parseOpenui(doc, registry)          [SP4a: bind + validateSpec 422 gate]
        ─▶ Specification
           (callers may serializeOpenui(spec) → canonical .openui to seed an editor)
```

Because the assembled document is re-parsed and (optionally) re-serialized through SP4a, authored fragments need **not** be canonically formatted — the round-trip normalizes them. The questionnaire is a *closed generator of `.openui` text*, nothing more.

## Questionnaire schema

Authored in `@boyscout/schemas` (Zod 4) alongside `Specification`, so the contract lives with the other core schemas.

```yaml
bridge: astryx-react          # header: emitted into the assembled .openui doc.
platform: react               #   The caller passes the MATCHING DialectRegistry.
questions:
  - id: screen
    type: single              # single | multi
    prompt: Screen type?
    options:
      - value: login
        contributes:
          id: login-card      # explicit feature id; compose() errors on collision
          capability: component
          openui: |           # a .openui tree BODY (not a full doc)
            Card { VStack(2) { Heading(3, "Sign in") Button("primary", "Log in") } }
      - value: dashboard
        contributes:
          id: dashboard-grid
          capability: component
          openui: |
            Card { Grid(2) { Heading(3, "Overview") } }

  - id: sections
    type: multi
    prompt: Which sections?
    enabledWhen: { screen: [dashboard, settings] }   # see enabledWhen below
    options:
      - value: header
        contributes: { id: header-bar, capability: component, openui: 'Card { Heading(2, "Header") }' }
      - value: footer
        contributes: { id: footer-bar, capability: component, openui: 'Card { Text("body", "Footer") }' }
```

Zod types (names indicative):

```ts
interface Contribution { id: string; capability: string; openui: string }
interface Option        { value: string; contributes: Contribution }
interface Question {
  id: string;
  type: "single" | "multi";
  prompt: string;
  options: Option[];
  enabledWhen?: Record<string, string | string[]>;   // absent = always enabled
}
interface Questionnaire { bridge: string; platform: string; questions: Question[] }

type Answers = Record<string, string | string[]>;     // questionId -> answer
```

## `enabledWhen` semantics

A **closed predicate map**, evaluated with **no expression parser** — it is data:

- `enabledWhen` is `{ questionId: value | [values] }`.
- **All keys must match** (logical AND across keys).
- A **list value means any-of** (logical OR within one key).
- Matching against a **single** answer is equality; against a **multi** answer is "includes".
- A question with no `enabledWhen` is always enabled.

Constraints (enforced at `parseQuestionnaire`):

- `enabledWhen` may reference **only earlier questions** (declaration order). This makes enablement a single forward pass and makes cycles unrepresentable.
- Every referenced `questionId` and every referenced value must exist in that earlier question's option set (typo protection).

Enablement is **always recomputed from the answers**, never trusted from any input flag — the human may have answered a question that a later change disabled.

## API surface

```ts
// parse + Zod-validate the YAML; throws QuestionnaireError on malformed YAML/schema
// or forward-reference / unknown-reference violations (mirrors SP4a's DialectError).
function parseQuestionnaire(yaml: string): Questionnaire

// pure: the forward-pass enablement result. SP5b's UI uses this to show/hide questions.
function enabledQuestions(q: Questionnaire, answers: Answers): Question[]

// Result type (not throw): one composition can surface several problems at once,
// matching the 422 gate's multi-violation style.
type ComposeResult =
  | { ok: true;  spec: SpecificationT }
  | { ok: false; violations: string[] }
function compose(q: Questionnaire, answers: Answers, registry: DialectRegistry): ComposeResult
```

Rationale for the two shape choices (confirmed in brainstorming):
- **`compose` returns a Result** rather than throwing, because composition can produce multiple violations (incomplete answers, id collision, closed-set violations, downstream gate failures) — the same multi-violation shape as the existing 422 gate. `parseQuestionnaire` still *throws*, matching SP4a's `parseOpenui`/`DialectError`, because a malformed questionnaire file is a single fatal authoring error, not a set of user-answer problems.
- **bridge/platform live in the questionnaire header**, because the fragments are inherently bridge-specific (they use that bridge's node types). The caller passes the matching `DialectRegistry` (required by `parseOpenui` anyway); a mismatch surfaces as a normal parse/gate violation.

## Error contract (what `compose()` reports)

Closed contract, validated strictly. Each becomes an entry in `violations`:

| Condition | Example message |
|---|---|
| Enabled question has no valid answer | `question 'screen' is required` |
| Answer value not among the question's options | `'grid' is not an option of 'screen'` |
| Answer supplied for an unknown question id | `unknown question 'colour'` |
| Duplicate feature id across selected fragments | `duplicate feature id 'header-bar'` |
| Assembled doc fails `parseOpenui` / 422 gate | *(the underlying dialect/gate violations, surfaced verbatim)* |

Answers to **disabled** questions are silently ignored (not a violation) — enablement is recomputed, so a stale answer to a now-hidden question is expected and harmless.

## Determinism & testing

Deterministic **by construction**: assembly order is declaration order; `parseOpenui`/`serializeOpenui` already route through `@boyscout/determinism` (canonical-JSON, byte-writer). The engine introduces no ordering, sorting, timestamp, or randomness of its own.

Coverage (aligns with §20 "Parser/DSL" + the roadmap's SP5 proof):

- **Property test** — `compose(q, answers)` is stable across runs and its `serializeOpenui(spec)` bytes are identical run-to-run; permuting the *keys* of the `answers` object does not change the output (order comes from the questionnaire, not the answer map).
- **Golden test** — a sample questionnaire + a fixed answer set → an exact canonical `Specification` (and its canonical `.openui`), byte-compared.
- **`enabledWhen` unit tests** — AND across keys, any-of within a key, single-equality vs multi-includes, always-enabled (no clause), and the forward-only / unknown-reference rejections at parse time.
- **Error-case unit tests** — one per row of the error contract above, asserting the exact `violations` entry.

No new OS-golden CI matrix is needed: the composed spec's byte-identity is already guaranteed by SP4a's cross-OS `.openui` golden (SP5a produces input to that same proven path).

## Proof it's done (roadmap alignment)

The roadmap's SP5 proof is "closed questionnaire drives composition; features stream via SSE; per-node annotations enrich context." SP5a delivers the **first clause** headlessly: a closed questionnaire deterministically composes a validated `Specification`. The SSE streaming and annotations clauses are SP5b.

## File structure

- `packages/questionnaire/src/index.ts` — `parseQuestionnaire`, `enabledQuestions`, `compose`, `QuestionnaireError`, public types.
- `packages/questionnaire/src/enabled.ts` — `enabledWhen` evaluation (pure, forward pass).
- `packages/questionnaire/src/assemble.ts` — answers → raw `.openui` document string (declaration-order block assembly + header).
- `packages/schemas/src/index.ts` — add the `Questionnaire`/`Question`/`Option`/`Contribution` Zod schemas + `Answers` type.
- `packages/questionnaire/test/` — `compose.test.ts` (golden + property), `enabled.test.ts`, `errors.test.ts`, and a `fixtures/` sample questionnaire.

Package wiring follows the existing `@boyscout/dialect` package (same `package.json`/`tsconfig`/build shape); `@boyscout/questionnaire` depends on `@boyscout/dialect`, `@boyscout/schemas`, and **`yaml@2.9.0`** — already a monorepo dependency (`@boyscout/runtime` parses `boyscout.config.yaml` with it via `import { parse } from "yaml"`). No new runtime dependency is introduced.

## Non-goals (SP5a)

- Placeholder / `$slot` substitution in fragments (pure selection only).
- Negation or comparison operators in `enabledWhen` (closed AND/any-of map only).
- The questionnaire **UI**, SSE streaming, per-node annotations — all SP5b.
- CLI/daemon wiring, questionnaire-file discovery, `boyscout.config.yaml` integration — SP5b.
- `metadata.checksum` computation — remains separately tracked/deferred (as in SP4).
