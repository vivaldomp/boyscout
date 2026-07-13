# SP4a — `@boyscout/dialect`: `.openui` Round-Trip (headless) — Design

> Sub-project of BoyScout v1 (`docs/V1-ROADMAP.md`, decisions D1–D10 in `docs/FIRST-SPEC.md`). This is the **first half of SP4**, split out so the highest-risk, fully headless piece — the byte-stable DSL round-trip (D10) — is proven before the browser stack (Renderer + SPA + secure daemon) is built on top of it. Builds on merged SP1 + SP2 + SP3.

## Goal

A new core package, `@boyscout/dialect`, that projects the existing `Specification`/`AstNode` schema **to and from** a persisted `.openui` text file — byte-stable in both directions (**D10**) — and proves that an authored `.openui` drives the real generation engine to byte-identical scaffolds.

## Scope decision (why SP4a, not all of SP4)

The roadmap's SP4 row bundles four independent subsystems: the dialect, the Astryx `<Renderer/>`, `apps/boyscout-ui`, and the secure Hono daemon. This cycle delivers **only `@boyscout/dialect`**. Rationale: the dialect is fully headless and carries SP4's thesis-grade guarantee (byte-stable both-directions round-trip); everything else consumes its output. This mirrors the project's ordering principle — *front-load risk, prove it headless first* — the same reasoning that placed SP3 before SP4. **SP4b** (Renderer + SPA + secure daemon + approval gate) is a separate spec → plan → build cycle built on the proven AST.

## Decided forks

1. **Scope = dialect only (SP4a).** Renderer/SPA/daemon → SP4b.
2. **One `.openui` file = one whole `Specification`** (1:1 with `spec.json`, the authoritative persisted form).
3. **Positional args, bound via the registry.** The DSL holds to §17.1 ("positional, never arbitrary keys"); `BridgeRegistry` gains `paramsFor(nodeType)` giving ordered prop names, and the dialect receives the registry as a parameter (same pattern as `validateSpec(input, registry)`), staying bridge-agnostic in its deps.
4. **Canonical-normalizing round-trip.** `serializeOpenui` emits the one canonical form; parsing drops comments/trivia; any input converges to canonical in one pass. No comment/whitespace preservation in v1 (determinism-clean, simple parser).
5. **Proof runs through `generate`; fold the two deferred untrusted-input prerequisites** (prop/text escaping in the Astryx provider; zero-child logic-bearing guard) — the dialect is where untrusted authoring input first enters, so the boundary is closed at the SP where it opens.

## Data model (already exists — nothing new to invent)

From `@boyscout/schemas`:

```ts
interface AstNodeT { type: string; props?: Record<string, unknown>; children?: AstNodeT[] }
const Feature = { id, capability, tree: AstNode, annotations, props, approved }
const Specification = { version, features: Feature[], metadata: { bridge, platform, checksum } }
```

The dialect projects this tree to/from `.openui` text. The "AST is canonical" (D10); `spec.json` is its authoritative persisted form; `.openui` is the byte-stable editable projection.

## Package posture

`packages/dialect/` — **core, authoring-stage.** Depends only on:
- `@boyscout/schemas` (types + `validateSpec`'s registry contract),
- `@boyscout/determinism` (`writeBytes` for the canonical byte layer).

**No bridge import. No react.** Positional-arg binding is driven by a registry passed as a parameter, so the package stays bridge-agnostic in its dependency graph while still resolving arg order. (The dialect is authoring-stage, not the generation Runtime governed by §14.1, but staying agnostic in deps is clean and consistent.)

### Public API — the whole round-trip

```ts
parseOpenui(text: string, registry: DialectRegistry): SpecificationT   // text → bind → validate → spec
serializeOpenui(spec: SpecificationT, registry: DialectRegistry): string   // spec → canonical .openui text
```

where `DialectRegistry = Pick<BridgeRegistry, "capabilities" | "nodeTypesFor" | "paramsFor">`.

## Grammar (canonical form)

- **Header line** projects `metadata` + `version`: `spec version=<v> bridge=<b> platform=<p>`. (Named `key=value` fields — this is metadata, not a node call, so it does not conflict with the positional-node rule; clearer for a small fixed field set. `checksum` is not authored — see scope boundary.)
- **Feature:** `<capability> <id> =` followed by its tree, indented.
- **Tree node:** `Type(<positional props>) { <children> }`.
  - **Parens = positional props**, bound to names via `paramsFor(type)`.
  - **Braces = children.**
  - **Leaf** node → no braces. **No-prop** node → no parens.
- **Literals:** `number` (`3`), `"string"` (double-quoted, with `\"`/`\\`/`\n` escapes), `true`/`false`, `null`. Enum-ish values are **quoted strings** (`"body"`, `"primary"`) — no bare-identifier ambiguity, simplest lexer. Bare tokens are reserved for `true`/`false`/`null`.
- **Formatting is canonical by construction:** 2-space indent, single space after commas, one blank line between features, trailing newline, LF line endings. The serializer *is* the formatter (there is no Biome for a custom DSL); determinism comes from deterministic emission + `writeBytes`.

The `apps/cli/test/fixtures/spec.json` feature round-trips to exactly:

```
spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
```

## SP4a-expressible subset (honest scope boundary)

The round-trip guarantee covers what SP4a can author. Fields populated by *later* workflow stages are derived/defaulted, not projected:

| Field | SP4a behavior | Owner |
|---|---|---|
| `metadata.{bridge,platform}`, `version` | authored in the header | SP4a |
| feature `{id, capability, tree}` | authored | SP4a |
| `approved` | defaults `true` | SP4b (approval gate + draft/approved marker) |
| `annotations`, feature-level `props` | default `{}` | SP4b (per-node annotation UI) |
| `metadata.checksum` | stays `""` (inert) | deferred (tracked separately) |

Property tests generate specs **within this subset**. A spec carrying an SP4b-owned field (e.g. `approved:false`, non-empty `annotations`) is out of SP4a's round-trip scope by construction — SP4a has no UI to produce one.

## The pipeline

### `parseOpenui` = lex → parse → bind → validate

1. **lex/parse** (`parse.ts`, text → raw tree): line-oriented, indentation-driven. Produces raw nodes `{ type, args: Literal[], children: raw[] }`, features, and a header struct. Pure syntax — knows no prop names. Errors carry **line numbers**: unterminated string, bad/inconsistent indent, unknown token, paren/brace mismatch.
2. **bind** (`bind.ts`, raw → `SpecificationT`): for each raw node, `paramsFor(type)` maps positional `args` → named `props` (zip position→name; value JS-type from literal syntax). Assembles features (`approved:true`, `annotations:{}`, `props:{}`) and `metadata` (`checksum:""`). Semantic errors here, with line numbers: unknown `type` (not in `nodeTypesFor(capability)`) → reject; **more args than params** → reject.
3. **validate**: run the assembled spec through the existing `validateSpec(spec, registry)` (Zod + capability pre-barrier, including the new zero-child guard). One gate — the dialect does not re-implement validation.

### `serializeOpenui` = the inverse, deterministic

- Emit the header, then features in **spec array order** (no re-sorting — preserving given order is what makes AST↔text lossless).
- Per node: `paramsFor(type)`, emit present props **in param order** as positional literals; recurse children into a brace block. A prop present on the node but **absent from `paramsFor` → throw** (loud): SP4a-expressible specs only carry registry-known props. Values re-literalized by JS type (string → quoted + escaped; number/bool/null → bare).
- Final bytes through `@boyscout/determinism` `writeBytes` (LF/UTF-8/no-BOM).

## Registry extension

`BridgeRegistry` gains one method, mirroring SP3's `nodeTypesFor`:

```ts
paramsFor(nodeType: string): readonly string[]   // ordered prop names; e.g. "Heading" → ["level","text"]
```

The astryx bridge implements it for every node type it declares — e.g. `Card → []`, `VStack → ["gap"]`, `Heading → ["level","text"]`, `Text → ["type","text"]`, `Button → ["variant","text"]`, plus SP3's logic-bearing node types. Ordered lists live **colocated with the existing node-type declarations** so vocabulary and arg-order share one source of truth. This is the mechanical bulk of SP4a.

## Prerequisite fixes (now reachable — untrusted text hits `generate`)

- **Escaping** (`packages/bridges/bridge-astryx-react/src/provider.ts`, `renderNode`/`renderAttrs`): escape string prop values and JSX text/children before emit. Attribute strings escape `"` (and use JS-string-literal escaping for expression props); JSX text escapes `<`/`>`/`{`/`}`/`&`. Targeted.
- **Zero-child guard** (`packages/guardrails`, `checkExpressible`): a `service`/`store`/`http` feature with zero `Method`/`Action`/`Endpoint` children → 422 at the pre-barrier (reject un-expressible spec at source, §10). One guard clause.

## Testing

| Layer | Test |
|---|---|
| **Parser units** | literals & type coercion; nesting; positional bind; each error path (unterminated string, bad indent, unknown node type, arity overflow) thrown with a line number |
| **Round-trip laws** (property tests over a curated corpus; no fuzzing per D5) | (1) canonical `.openui` → parse → serialize `==` input; (2) subset-spec → serialize → parse `==` spec (AST-lossless); (3) messy input → parse → serialize is idempotent under a second pass (convergence to canonical) |
| **Cross-OS golden** | `.openui` golden + `writeBytes(serialize(spec))` byte-identical on Linux/macOS/Windows (existing 3-OS matrix) |
| **E2E generate proof** | author `.openui` → `parseOpenui` → `generate()` → **byte-identical scaffolds** (golden). Fixture text includes `"a \"quote\" <tag> {brace}"` → proves escaping yields valid, compiling JSX |
| **Zero-child rejection** | `service` with no methods → 422 |

Property tests are **law-based over a representative corpus** (deterministic), not `fast-check` — no new dependency, and fuzzing is explicitly deferred (**D5**).

## Package layout

- **Create** `packages/dialect/` → `src/{parse,bind,serialize,index}.ts` + `test/`. Focused files, one responsibility each; raw-TS package (`exports: "./src/index.ts"`, no build step) like the other core packages.
- **Modify** `packages/schemas` (add `paramsFor` to the `BridgeRegistry` contract), `packages/bridges/bridge-astryx-react` (implement `paramsFor`; add escaping), `packages/guardrails` (zero-child guard).
- **Test-only** in `apps/cli/test` (E2E generate-from-`.openui` golden), alongside the existing SP3 goldens.
- **No new CLI command.** The E2E proof runs at library level (`parseOpenui` + `generate`). A `boyscout` `.openui` entrypoint is SP4b's workflow concern — YAGNI here.

## Determinism integration

`.openui` bytes route through `@boyscout/determinism` `writeBytes` (LF/UTF-8/no-BOM), the same sanctioned path as scaffolds. There is no Biome pass for the DSL — canonical form is defined by the serializer's deterministic emission rules and proven byte-identical cross-OS by the existing golden matrix. `.openui` is a first-class persisted artifact and, being determinism-covered, sits **inside** the byte-identity boundary (unlike durable `src/`).

## Deferred to SP4b (explicit)

Astryx `<Renderer/>`, `apps/boyscout-ui` SPA, the secure Hono daemon (§21: CSPRNG session token, origin enforcement, loopback bind, path shielding), the approval gate + draft/approved marker, per-node annotations, SSE, and any `.openui` CLI/file-watch entrypoint. `metadata.checksum` computation stays deferred and separately tracked.

## Invariants preserved

- **Agnosticism (§14.1):** `@boyscout/dialect` imports no bridge and no react; arg-order arrives via a registry parameter. The generation Runtime and core packages remain bridge-free.
- **Determinism (D3a/D3b):** `.openui` serialization is deterministic-by-construction + `writeBytes`, cross-OS golden-tested.
- **Double barrier (§10):** authoring input flows through the existing `validateSpec` pre-barrier (now with the zero-child guard); the scaffold-only post-barrier is unchanged.
- **Seam (D2d):** untouched — SP4a produces `spec.json`; the SP3 seam machinery consumes it as before.
