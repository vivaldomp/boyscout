# SP1 — Foundations & Determinism Harness (Design)

> First sub-project of the v1 roadmap (`docs/V1-ROADMAP.md`). Builds the ground everything else stands on: shared contracts, the determinism primitives, and the multi-OS golden CI harness that proves cross-OS byte-identity (D3b) from day one. References architecture decisions **D1–D10** in `docs/FIRST-SPEC.md`.

## Goal & done-criteria

Deliver the foundation packages and prove the determinism thesis's mechanical core **before any generation exists**:

- `@boyscout/schemas` validates sample specs; the `CapabilityContract` interface typechecks against a sample declarative *and* logic-bearing contract.
- `@boyscout/determinism` primitives (`canonicalJson`, `sortByBytes`, `hash`, `format`, `writeBytes`) produce **byte-identical output on Linux, macOS, and Windows** in CI.
- Committed golden files fail CI on any drift (a Biome bump, a canonical-JSON regression).

## Stack (decided)

| Concern | Choice | Rationale |
|---|---|---|
| Monorepo | pnpm workspaces | §19.2 |
| Language | strict TypeScript | §19.3 |
| Validation | Zod 4 | §19.3 |
| Test runner | Vitest | §20 |
| **Formatter + lint** | **Biome** (pinned) | Cross-OS byte-identity long-pole (D3b): Rust, hermetic (no ambient cascade), deterministic-leaning. Doubles as the post-barrier lint engine (§10) — one tool, one pinned version for format *and* lint. |
| Canonical-JSON | **hand-rolled + golden-tested** | The core determinism primitive is the product's thesis; owning it (≈50 lines, own goldens) beats outsourcing to a transitive dep that could shift output. |
| CI | GitHub Actions, `{ubuntu, macos, windows} × node20` | Proves cross-OS byte-identity (D3b) from SP1. |

## Package layout

```
package.json            # workspaces; scripts: build, typecheck, test, format, lint (Biome)
tsconfig.base.json      # strict
biome.json              # pinned, explicit, hermetic (no ambient cascade)
vitest.config.ts
.github/workflows/ci.yml# {ubuntu,macos,windows} x node20 -> typecheck + golden suite
packages/
  schemas/              # @boyscout/schemas
  determinism/          # @boyscout/determinism
```

## `@boyscout/schemas` (Zod 4, agnostic — contracts only, zero logic)

- `Specification` — `boyscout-spec.json` shape: `version`, `features[]`, `metadata { bridge, platform, checksum }`.
- `Feature` — `{ id, capability, tree, annotations, props, approved }`; `props` typed generically (concrete shape supplied by the Bridge's Registry, not here).
- `AstNode` / tree node types — the shared OpenUI-lang AST ("one AST", §17.1).
- `BoyscoutConfig` — `boyscout.config.yaml` shape: `platform`, `bridge`, `capabilities[]`, `bridges{}`, `guardrails{}`, `templates{}`.
- `ExecutionGraph` — `{ nodes[], edges[], ordering }`.
- `CapabilityContract<In, Out>` — the **abstract interface** every Registry entry satisfies: `{ id, version, tier: 'declarative' | 'logic-bearing', inputs, outputs, validators, constraints, seam?, metadata }`. Generic slots; concrete `inputs` are authored in each Bridge's Registry (Astryx SP2, Material SP6) because props differ per bridge (§8/§14.3).
- `SeamContract` — `{ srcPath, typedSignature, binding }` (D2d).
- `Event` — authoring/SSE event envelope.
- `GuardrailResult` — `{ ok, violations[], code }`.

**Boundary:** per-capability concrete input schemas are **out of SP1** — they are bridge-owned (D1, §8, §14.3). Defining them centrally would re-couple the agnostic core to framework specifics.

## `@boyscout/determinism` (D3a — the only sanctioned serialize/sort/format/write path)

| Primitive | Contract |
|---|---|
| `canonicalJson(value): string` | Byte-sorted keys, numeric-key handling, fixed number formatting, defined null/undefined policy, no whitespace ambiguity. Golden-tested. |
| `sortByBytes(items, keyFn)` / `byteCompare(a,b)` | Codepoint collation — **never** `localeCompare`. |
| `hash(bytes): string` | SHA-256 over canonical bytes. |
| `format(source, lang): string` | **Hermetic Biome wrapper**: pinned version, explicit in-memory config, ambient config discovery disabled. |
| `writeBytes(content): Uint8Array` | LF-only, UTF-8 no BOM, fixed final newline. (No timestamps / abs-paths is a generation-side discipline, enforced later.) |

Everything downstream (planner, codegen, runtime, dialect) routes serialize/sort/format/write through this module — drift cannot be introduced by accident.

## Golden harness (the reason SP1 exists)

1. Tiny fixtures: representative structured values + sample TS/HTML source strings.
2. Committed goldens for `canonicalJson(fixture)`, `format(sourceFixture)`, `writeBytes(...)`.
3. `ci.yml` runs the golden suite on `{ubuntu, macos, windows}`; the key assertion is that goldens match **byte-for-byte on all three OSes**.
4. Biome's cross-OS determinism is the long-pole this harness is built to catch early.

## Testing (Vitest)

- **Primitive units:** canonical-JSON edge cases (nesting, numeric keys, unicode, number formatting); collation ordering; hash stability; `format(format(x)) === format(x)` idempotency.
- **Schema units:** sample specs validate; malformed specs reject; the `CapabilityContract` interface typechecks against a declarative and a logic-bearing sample.
- **Golden suite (cross-OS):** via the CI matrix.

## Risks

- **Biome cross-OS stability** is the one real risk; the golden matrix exists precisely to surface it. If a byte differs across OS, it fails CI on day one — cheap to catch, which is the point.
- **Hermeticity:** Biome must be invoked with an explicit config and no ambient `biome.json` cascade; version pinned exactly in `package.json` + lockfile.

## Not in SP1 (deferred to later sub-projects)

Per-capability concrete input schemas (bridges, SP2/SP6); the Runtime protocol, planner, codegen, guardrail rules (SP2); durable emit / seam mechanism (SP3); anything authoring-facing (SP4+).
