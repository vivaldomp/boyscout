# SP8b — Full E2E, Lockfile & Hardening — Design

> Final slice of SP8 (roadmap capstone). SP8a (the Skill layer) shipped in PR #11; SP8b closes the remaining four pillars: the full **E2E chain green in CI**, the **`boyscout.lock`** transitive-closure lockfile (D3b), a **matured cross-OS golden**, and the **§21 hardening checklist gate** (plus the SP8a `composeSkill` escaping carry-in). References `docs/FIRST-SPEC.md` (§21 Security, §22 Non-Goals) and `docs/V1-ROADMAP.md` (SP8 row).

## Goal / proof-of-done

The full **agent → CLI → browser → approval → generate** chain runs green in CI; generation emits a `boyscout.lock` whose closure can be re-verified for drift; the E2E's generated output is byte-checked cross-OS as a golden; every §21 control maps to a passing test. This is the v1 ship gate — after SP8b the roadmap's SP8 row is fully satisfied.

## Context

State of the four pillars in the repo today (verified 2026-07-14):

| Pillar | State | Nature |
|---|---|---|
| **E2E** | `apps/boyscout-ui/e2e/{authoring,guided}.spec.ts` exist with the full chain + a negative gate test; `@playwright/test` installed; `e2e` script present. **No `playwright.config.ts`; CI never runs it** (`ci.yml` = typecheck/test/format/lint). | Wire up + debug-to-green |
| **`boyscout.lock`** | Does not exist anywhere. | Net-new feature (D3b) |
| **Cross-OS golden** | `apps/cli/test/goldens/` exists, byte-checked in the `pnpm test` matrix on all 3 OSes. | Incremental coverage |
| **§21 hardening** | Security shipped in **SP4** (CSPRNG token, Origin enforcement, path shielding, loopback bind live in `apps/cli/src/author/app.ts`; roadmap line 44 confirms it was never deferred). | Audit/checklist, not new code |
| **composeSkill escaping** | SP8a carry-in: `meta`/`id` interpolated with no escaping. | Tiny hardening |

## Decisions (locked in brainstorming)

- **E2E runs Ubuntu-only in CI.** Cross-OS byte-identity is already proven by the golden `pnpm test` matrix on all 3 OSes; E2E proves the chain *behaves*, which is OS-independent. Ubuntu-only avoids Windows/macOS Playwright flakiness.
- **`boyscout.lock` has write + verify teeth.** `generate` writes the lock; `generate --check` recomputes the closure and exits non-zero on drift.

## Design

### 1. E2E pillar — wiring, not authoring

**Create `apps/boyscout-ui/playwright.config.ts`:**

- `testDir: "./e2e"`, single `chromium` project.
- Timeout generous enough for the `beforeAll` daemon spawn + port poll (the spec polls up to 20s); set test timeout to `60_000`.
- `retries: process.env.CI ? 1 : 0` for CI tolerance.
- **No `webServer` block** — the specs spawn the daemon themselves in `beforeAll`.

**New CI job `e2e` in `.github/workflows/ci.yml`**, separate from the cross-OS `test` matrix:

- `runs-on: ubuntu-latest` only.
- Steps: checkout → pnpm/action-setup → setup-node (cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm --filter boyscout-ui build` (the specs assert `dist/` exists) → `pnpm exec playwright install --with-deps chromium` → `pnpm --filter boyscout-ui e2e`.

**Debug-to-green is an explicit task.** The specs reference `BOYSCOUT_AUTH_TOKEN`, `/api/parse`, and test-ids (`preview`, `approve-user-card`, `commit`, `message`). The first real run will likely surface drift between the specs and the current UI/daemon; fixing that drift until both specs pass is in scope and is the risk this pillar retires.

### 2. `boyscout.lock` — transitive-closure lockfile (D3b)

**New package `@boyscout/lockfile` (`packages/lockfile`)** — pure core, no I/O:

- `buildLockClosure({ spec, config, bridge, runtimeVersion }) → LockClosure` — collects the closure that *actually produced* the generation:
  - `runtimeVersion: string`
  - `bridge: { id: string; version: string }`
  - `capabilities: ReadonlyArray<{ id: string; version: string; tier: "declarative" | "logic-bearing" }>` — every `CapabilityContract` the spec's features resolve, sorted by `id` via `sortByBytes`.
  - `checksum: string` — from `spec.metadata.checksum`.
  - True closure: only what generation touched, never the whole registry.
- `serializeLock(closure) → string` — `canonicalJson(closure)` → `writeBytes(...)`, byte-stable by construction.
- `diffLock(a: LockClosure, b: LockClosure) → string[]` — human-readable drift lines; empty array = identical.

**Contract touch — add `version` to `Bridge`** (`packages/schemas`): the `Bridge` interface has `id` but no `version`; add `readonly version: string`, populated by both bridges (mirrors how SP8a added `skill?`). `buildLockClosure` reads `bridge.version`; `runtimeVersion` reads `@boyscout/runtime`'s `package.json` `version`.

**Wire into `generate` (`apps/cli`):**

- After a successful generation, write `boyscout.lock` at project root via `serializeLock`.
- With `--check`: recompute the closure, read the on-disk `boyscout.lock`, compare via `diffLock`. Any drift → print the diff and exit non-zero. No `--check` → write/overwrite as today.

### 3. Matured cross-OS golden

The E2E generates real scaffolds from `e2e/fixtures/seed.openui`. Capture that generated output as a golden under `apps/cli/test/goldens/` and assert it byte-for-byte in the existing `pnpm test` matrix (already all 3 OSes). This makes the E2E's output byte-checked cross-OS, not merely "the chain ran." Add missing cases only — no restructuring of the existing goldens.

### 4. §21 hardening checklist gate

Security already shipped in SP4, so this is an **audit doc, not new code**: `docs/security-checklist.md` maps each §21 control to the existing test that proves it:

- CSPRNG session token → test asserting the token is CSPRNG-derived (not the generation "no OS randomness" path, per §21).
- Origin enforcement → test rejecting a mismatched `Origin`.
- Path shielding against `..` → test rejecting traversal.
- Loopback-default bind (`127.0.0.1`; `0.0.0.0` only under explicit config) → test asserting the default bind.

If any control has no covering test, add exactly that one test; otherwise the deliverable is the coverage-mapping doc, which gates the ship.

### 5. composeSkill escaping (SP8a carry-in)

Now that the CLI/E2E path can feed `meta` from real spec/config, harden `packages/skill-template`:

- Escape `meta.name` / `meta.description` as YAML-safe quoted strings in the frontmatter.
- Guard the bridge `id` used in `### <id>` headings: ids are already constrained identifiers, so reject/strip newline and leading-`#` characters before interpolation.
- One test per escape path (malicious `meta.name` with a newline; an `id` with an injected heading char).

## Tests

- **E2E:** both specs pass locally (`pnpm --filter boyscout-ui build` then `pnpm --filter boyscout-ui e2e`) and in the new CI job.
- **Lockfile:** closure is order-independent and byte-stable across two runs; `serializeLock` output is byte-identical; `generate --check` passes on a fresh lock and fails (non-zero + non-empty `diffLock`) after a bumped bridge/capability version.
- **Golden:** the seed-derived scaffold golden asserts byte-for-byte in `pnpm test` on all 3 OSes.
- **Security:** each §21 control has a passing test referenced by the checklist doc.
- **Escaping:** frontmatter and heading escape tests pass with adversarial `meta`/`id` inputs.

## Not in SP8b (§22 non-goals — stay out)

- No multi-user / team server (local, single-user).
- No `.running/` merge / protected-region codegen (D2c) — the seam stays two-file with a typed contract.
- No new bridges, no vector search/RAG, no layout drag-and-drop.

## Conventions (repo — carry into the plan)

- Tests: `pnpm exec vitest run <path>`. Typecheck: `pnpm --filter <pkg> typecheck` / `pnpm -r typecheck`.
- Lint: `node_modules/.bin/biome lint packages apps`. Format: `node_modules/.bin/biome format packages apps` — **run `format` before commit** (SP7 CI failed on format-check drift when only `lint` ran locally).
- ESM, `type: module`, packages export `./src/index.ts` directly — no build step (the `boyscout-ui` `dist/` the E2E needs is the Vite UI bundle, not a package build). Strict TS (`import type`/inline `type`, `.js` relative specifiers on `.ts` source, conditional-spread for optional props, guards/casts for index access).
- INVARIANT (carried from SP8a): the Runtime never reads `bridge.skill`; only skill-template does. The new `bridge.version` field is read by `@boyscout/lockfile`, which is generation-domain — no invariant conflict.
