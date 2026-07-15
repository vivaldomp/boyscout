# SP9 — npm Alpha Distribution & Public Documentation — Design

> First public release of the CLI. Turns the private monorepo (`SP1`–`SP8`, all 15 packages `private: true`, `version: 0.0.0`, no build step) into a published `@boyscout/cli` alpha on npm, released by a tag-triggered GitHub Action, fronted by a README, LICENSE, and CONTRIBUTING. References `docs/FIRST-SPEC.md` (D2b durable emit, D3a/D3b determinism) and `docs/V1-ROADMAP.md` (SP8 done).
>
> **Numbering note:** the v1 roadmap ends at SP8. This is post-v1 *delivery* work — it ships the engine SP1–SP8 built without changing its behavior — and takes the next number by convention. `V1-ROADMAP.md` is unchanged.

## Goal / proof-of-done

`npx @boyscout/cli@alpha init` scaffolds a project and its Claude Code skill; `npx @boyscout/cli@alpha generate` produces governed, byte-identical output — from a package installed off the public registry, not from the monorepo. Pushing a `v*` tag builds, gates, publishes, and cuts a GitHub Release with no stored npm credential. The repo has a README, an MIT LICENSE, and a CONTRIBUTING that documents the spec+plan traceability chain.

## Context — why this is a design and not a config change

Nothing in the repo is publishable today:

- All 15 packages (13 in `packages/*`, 2 in `packages/bridges/*`) and `apps/cli` are `private: true` at `version: 0.0.0`.
- Every package's `exports` points at raw `.ts` source; `tsconfig.base.json` sets `noEmit: true`. There is **no build step anywhere** — the monorepo runs through `tsx`.
- `apps/cli` declares `bin: { boyscout: "./src/bin.ts" }` — a TypeScript file Node cannot execute.
- `apps/cli` depends on 10 `workspace:*` packages that do not exist on the registry (11 once `init` adds `@boyscout/skill-template`).
- The npm name `boyscout` is **taken** (v0.3.9, unrelated project). `@boyscout/*` has no published packages.

## Decisions

| # | Decision |
|---|---|
| **E1** | **One bundled package.** Publish `@boyscout/cli` only; the 15 packages stay private and unbuilt. Third-party bridge authoring (which would need `@boyscout/schemas` + `@boyscout/runtime` published) is deferred until someone asks for it. |
| **E2** | **Name `@boyscout/cli`**, requiring the free npm org `boyscout`. Keeps the name the code already uses (zero renaming) and reserves the scope for a future package split. |
| **E3** | **Bundle `@boyscout/*` only; externalize every third-party dependency.** Forced, not stylistic — see "The bundling rule" below. |
| **E4** | **Tag-push release + npm Trusted Publishing (OIDC).** No `NPM_TOKEN` secret; provenance attestation for free. |
| **E5** | **Publish under dist-tag `alpha`.** `latest` stays unclaimed, so no one installs an alpha by accident. Every documented install line carries `@alpha`. |
| **E6** | **`pnpm` for install/build, `npm` for publish.** pnpm does not document OIDC trusted publishing support; npm does. |
| **E7** | **New `boyscout init` command**, create-if-absent, so the README's headline Claude Code path is real and SP8a's `composeSkill()` becomes reachable by users. |

## The bundling rule (E3)

`@boyscout/determinism` and `@boyscout/guardrails` depend on `@biomejs/wasm-nodejs` — a WASM artifact esbuild cannot inline into a JS bundle. That package **is** the hermetic formatter, the component D3b's cross-OS byte-identity rests on. Rather than special-case it, all third-party code stays external. Dev and published builds then run identical code paths.

Published `dependencies` (the transitive third-party closure of the CLI, excluding `boyscout-ui`'s, which ship as built static assets):

| Dependency | Origin | Why it must ship |
|---|---|---|
| `@biomejs/wasm-nodejs`, `@biomejs/js-api` | determinism, guardrails | hermetic formatter (D3a) |
| `typescript` | bridge-astryx-react, bridge-material, bridge-contract-kit | runtime dep here, not a devDep |
| `zod` | schemas | spec/config validation |
| `yaml` | runtime, questionnaire | config + questionnaire parsing |
| `eta` | codegen | templates |
| `@astryxdesign/core` | bridge-astryx-react | bridge registry |
| `hono`, `@hono/node-server` | cli | `author` daemon |

**All nine pinned exactly — no caret or tilde ranges.** The formatter version is part of the determinism contract: a caret on `@biomejs/wasm-nodejs` would let a patch release silently change output bytes and void the guarantee the project is built on. The other eight are pinned for the same reason (any of them can influence emitted bytes) and for consistency.

## Build

esbuild, invoked from a `build` script on `apps/cli`:

```
entry     src/bin.ts
bundle    true
platform  node
format    esm
target    node20
outfile   dist/bin.js
banner    #!/usr/bin/env node
external  the nine dependencies above
```

`boyscout-ui`'s Vite output is copied to `apps/cli/dist/ui`, so the published tree is:

```
@boyscout/cli/
├── dist/
│   ├── bin.js     ← cli + its @boyscout/* dependency closure, bundled
│   └── ui/        ← boyscout-ui build output
├── package.json
├── README.md
└── LICENSE
```

Published `apps/cli/package.json` changes: drop `private`; `version: 0.1.0-alpha.0`; `license: "MIT"`; `bin: { boyscout: "./dist/bin.js" }`; `files: ["dist"]`; `publishConfig: { access: "public" }`; all `workspace:*` deps (10 today, 11 after `init` adds `@boyscout/skill-template`) move `dependencies` → `devDependencies` (after bundling they are build-time only), leaving the nine third-party pins as the only real `dependencies`.

## Two code changes the bundle forces

**`main.ts` runtime version.** It currently reads
`createRequire(import.meta.url)("@boyscout/runtime/package.json")`. That specifier does not resolve in the published package — `@boyscout/runtime` is bundled, not installed. It becomes a read of the CLI's own `../package.json`, which resolves correctly from both `src/main.ts` (dev) and `dist/bin.js` (published).

The lock field keeps the name `runtimeVersion`: in a bundled distribution the CLI version **is** the runtime version. Both values are `0.0.0` today, so the change is inert until the version bump — at which point lock content shifts `0.0.0` → `0.1.0-alpha.0`.

**Verified: this breaks no test and no golden.** `packages/lockfile/test/closure.test.ts` passes `runtimeVersion` as a literal (pure unit test, decoupled from any manifest); `apps/cli/test/lockfile.test.ts` asserts behaviour only (lock exists, `--check` passes/fails) and never exact version content; no golden embeds a lock (`grep -rln runtimeVersion apps/cli/test/goldens` → empty).

**`author/command.ts` UI path.** `--ui-dist` defaults to `../../../boyscout-ui/dist` (monorepo-relative, via `import.meta.url`). New default: `./ui` beside the entry if it exists, else the current path — one `existsSync`, so `author` works both from source and from npm.

## `boyscout init` (E7)

New `apps/cli/src/init.ts`, TDD'd, wired into `main.ts`'s command switch alongside `generate` and `author`. Writes three files:

| File | Content |
|---|---|
| `boyscout.config.yaml` | `platform`, `bridge: astryx-react`, `capabilities` — conforming to the `BoyscoutConfig` zod schema (`packages/schemas/src/index.ts:74`) |
| `boyscout-spec.json` | minimal valid `Specification` seed |
| `.claude/skills/boyscout/SKILL.md` | `composeSkill(bridges, meta)` from `@boyscout/skill-template` |

**Create-if-absent, never overwrite.** It reports skipped files and exits 0. This mirrors D2b's durable-emit rule and means running `init` in a live project cannot destroy a tuned config or an edited skill file. Adds `@boyscout/skill-template` to the CLI's deps (bundled).

## Release workflow (E4)

`.github/workflows/release.yml`, on `push` of tags matching `v*`:

```yaml
permissions:
  id-token: write   # OIDC → trusted publishing
  contents: write   # gh release create
```

```
checkout → pnpm 10.32.1 → node 20 (registry-url: registry.npmjs.org)
npm install -g npm@latest      # trusted publishing needs npm >= 11.5.1; node 20 ships npm 10
pnpm install --frozen-lockfile
guard:  git tag == apps/cli version, else fail
gate:   typecheck → test → format:check → lint
build:  boyscout-ui → cli bundle
npm pack --dry-run             # verify the tarball before publish is irreversible
npm publish --access public --tag alpha
gh release create --generate-notes --prerelease
```

The `npm install -g npm@latest` step is load-bearing: without it, npm 10 ignores OIDC, looks for a token, and fails.

`npm pack --dry-run` guards the one thing this design does not assert from documentation — whether `npm publish` tolerates `workspace:*` inside a published `devDependencies` block. The same pack check is added to `ci.yml`'s PR gate so a packaging regression fails on the PR, not on a tag.

### Manual prerequisite

Trusted publishing links an **existing** package to a repo + workflow, so it cannot be configured before the package exists. Bootstrap order:

1. Create the npm org `boyscout`.
2. First publish is manual and local: `npm publish --access public --tag alpha`.
3. Configure trusted publishing on npmjs.com → package `@boyscout/cli` → repo `vivaldomp/boyscout`, workflow `release.yml`.
4. Every subsequent release is a tag push.

Documented in CONTRIBUTING under *Releasing*, not left as folklore.

## Documents

### README.md

Order: logo + name → description → badges → Why BoyScout? → Quick start (Install → Your first design) → Contributing.

**The logo uses an absolute `raw.githubusercontent.com` URL, not `docs/logo.png`.** npm renders this README on the package page, where relative paths resolve against the registry and 404 — a broken image would be the first thing an alpha visitor sees.

Badges: TypeScript · Node 20 · pnpm · MIT · status `alpha` · CI. A line under them states the API can break between alpha releases.

*Why BoyScout?* draws on the thesis in `FIRST-SPEC.md` — *AI decides **what** to build; the Runtime decides **how***— and the boy scout rule the name comes from. Claims are limited to what SP1–SP8 proved: standards encoded as Bridges/Providers/Templates/Guardrails; byte-identical generation across Linux/macOS/Windows; guardrail violations fail the gate (422) instead of landing in the repo.

*Install* shows the Claude Code path first (`npx @boyscout/cli@alpha init`), with npm/pnpm/yarn/bun global installs inside a collapsed `<details>` block.

*Your first design* is the headless walkthrough: `init` → ask Claude Code for a login form → `generate` → emitted files + `boyscout.lock`, closing on byte-identity. The `author` browser loop gets a closing pointer, not a tutorial.

### LICENSE

MIT, `Copyright (c) 2026 Vivaldo Mendonça Pinto`.

### CONTRIBUTING.md

- **Development Setup** — Node ≥20, pnpm 10.32.1, `pnpm install`.
- **Running Locally** — `tsx src/bin.ts` for `init`/`generate`/`author`; `pnpm --filter boyscout-ui build` is required before `author`.
- **Tests** — `pnpm test`; `pnpm golden:update` and why goldens are cross-OS (D3b); Playwright E2E.
- **Pull Requests** — branch off `master`; the four gates (`typecheck`, `test`, `format:check`, `lint`); PR to `master`.
- **Releasing** — the bootstrap sequence above.

**Model + traceability requirement.** Stated as a contribution rule, not a suggestion: contributions must be produced with an **Opus- or Sonnet-class model running the superpowers skills**. The repo's traceability chain is real and every sub-project SP1–SP8 followed it:

```
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md    ← spec
docs/superpowers/plans/YYYY-MM-DD-<topic>.md           ← plan
.superpowers/sdd/progress.md                           ← ledger: branch, base, spec, plan, tasks
.superpowers/sdd/review-<base>..<head>.diff            ← per-task review diffs
```

A PR arriving as bare commits with no spec and no plan cannot be reviewed against intent, which is the purpose of the chain. The model class is named explicitly because smaller models drift off the skill workflow and silently skip the artifacts.

## Out of scope

- Publishing the 14 `packages/*` (E1) — revisit when third-party bridge authoring is a real request.
- Changesets (unnecessary for one package).
- Claiming the `latest` dist-tag (E5) — that is the 1.0 decision.
- Any change to generation behavior. This sub-project ships the existing engine; the only behavior additions are `init` and the `--ui-dist` default.

## Risks

| Risk | Mitigation |
|---|---|
| npm org `boyscout` unavailable | Fall back to `boyscout-cli` (confirmed free); rename is a package.json field, not a code change |
| `npm publish` rejects `workspace:*` in `devDependencies` | `npm pack --dry-run` in both CI and release; if it fails, strip devDeps from the published manifest at build time |
| ~~Version bump breaks lock goldens~~ | **Void — verified.** No golden embeds a lock; both lockfile tests are version-agnostic. See "Two code changes the bundle forces" |
| esbuild bundle breaks a dynamic require inside a `@boyscout/*` package | Smoke-test the built binary against the same fixtures the E2E uses, from a packed tarball |
