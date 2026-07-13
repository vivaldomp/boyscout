# SP4b — Authoring Front-End: Renderer + secure daemon + approval gate — Design

> Sub-project of BoyScout v1 (`docs/V1-ROADMAP.md`, decisions D1–D10 in `docs/FIRST-SPEC.md`). This is the **second half of SP4**. SP4a delivered the headless `.openui` dialect round-trip (D10, merged 2026-07-12). SP4b builds the browser authoring loop on top of that proven AST: the Astryx `<Renderer/>`, the `apps/boyscout-ui` SPA, and the secure Hono authoring daemon with §21 security and the approval gate. Builds on merged SP1 + SP2 + SP3 + SP4a. SP5 (guided questionnaire + SSE) and SP6 (second bridge) build on this.

## Goal

An author edits a `.openui` file in the browser, sees a **high-fidelity live preview** rendered in real Astryx/React components, approves each feature, and commits — producing a validated, canonical `boyscout-spec.json` (and its lockstep `.openui`) on disk. The existing headless `boyscout generate` then drives that spec to byte-identical scaffolds. This closes the roadmap's SP4 proof: *author `.openui` → high-fidelity preview → approve → validated `spec.json` → generate*.

## Scope decision (why SP4b is one cycle)

The SP4 roadmap row bundles four subsystems: the dialect (done in SP4a), the `<Renderer/>`, `apps/boyscout-ui`, and the secure daemon. This cycle delivers the remaining three **together**, because they only prove the authoring loop when wired end-to-end — the Playwright E2E (`author → preview → approve → commit → generate`) is the SP4 proof and needs all three present. The pieces are individually testable (the Renderer via component snapshots, the daemon via HTTP tests) so the cycle is not a monolith, but they ship as one branch.

**Not in SP4b** (→ SP5, per the roadmap): the closed questionnaire engine (`@boyscout/questionnaire`, `enabledWhen`), SSE live-workspace streaming, and the per-node annotations UI. The SP4b daemon therefore serves **plain HTTP** — no streaming.

## Decided forks

1. **All of SP4b in one cycle.** Renderer + Astryx map + SPA + agnostic daemon + Playwright E2E, one branch.
2. **Authoring loop = in-browser `.openui` editor + live preview.** The SPA has a text pane for the `.openui` source; on edit it POSTs to the daemon, which parses (SP4a dialect) → validates → returns the AST or line-numbered errors, and the Renderer live-previews it. This exercises the full dialect round-trip in the loop and matches "author `.openui` → preview" literally.
3. **Author/generation boundary: approve writes `spec.json`; the CLI generates.** The browser loop ends at approval: the daemon serializes canonical `spec.json` + `.openui` to disk (via `writeBytes`) once all features are approved and valid. Generation stays the existing headless `boyscout generate`. The authoring daemon **never imports the Runtime or a bridge's generation path** — keeping the two stages (§1.2) cleanly separate.
4. **The Astryx node-type→component map lives in `apps/boyscout-ui`.** `bridge-astryx-react` stays 100% react-free (its current state); the agnosticism guard stays trivially green; only the SPA touches react + `@astryxdesign/core`. Trade-off: Astryx's two faces (codegen catalog + preview map) live apart, so a test asserts the node-type lists match.
5. **Fold in both SP4a carry-forwards**, since SP4b's surface first triggers them (mirrors SP4a folding its two prereqs): the `.openui` `writeBytes` file-write entrypoint (+ cross-OS golden), and the logic-bearing codegen escaping fix (service/store/http providers).

## Architecture — two stages, stage-separated

Per §1.2 / D1, the *authoring stage* (React/Astryx + Renderer, browser) and the *generation stage* (framework-agnostic Runtime, CLI) are distinct cores. SP4b builds the authoring stage; it hands off to generation only through the persisted `spec.json`.

| Unit | Home | Depends on | Tested by |
|---|---|---|---|
| `@boyscout/renderer` | **new** `packages/renderer` | `react`, `@boyscout/schemas` (types) | component snapshots with a **mock** component map — headless, deterministic |
| Astryx component map | `apps/boyscout-ui/src` | `react`, `@astryxdesign/core` | rendered in the SPA; a node-type-parity test vs the bridge catalog |
| `apps/boyscout-ui` (SPA) | **new** `apps/boyscout-ui` | Vite, `react`, `react-dom`, `@boyscout/renderer`, `@astryxdesign/core`, `@stylexjs/stylex` | Playwright E2E |
| `boyscout author` daemon | `apps/cli` | Hono, `@boyscout/dialect`, `@boyscout/spec`, `@boyscout/determinism`, `@boyscout/bridge-astryx-react` (registry only) | Hono `app.request()` HTTP tests |

**Agnosticism (§14.1):** `@boyscout/renderer` imports no bridge and no design system — it walks the generic AST and mounts components handed to it. The daemon imports the bridge only for its **registry** (`paramsFor`/`nodeTypesFor`/`capabilities`, needed by the dialect) — never its providers/Runtime, never react. `bridge-astryx-react` stays react-free. Only `apps/boyscout-ui` imports react + Astryx.

## The generic Renderer (`@boyscout/renderer`)

```ts
type ComponentMap = Record<string, (props: RenderedProps) => ReactElement>;
interface RendererProps { ast: AstNodeT; components: ComponentMap; }
function Renderer(props: RendererProps): ReactElement;   // walks ast, mounts components[node.type], recurses node.children
```

- One `renderNode(node)`: look up `components[node.type]`; pass `node.props` (adapted by the injected component) and rendered `children`; text-bearing nodes pass their `text` prop as the child. Unknown node type → a visible fallback box (never throws — an in-progress edit must still preview).
- **Agnostic and pure:** given the same AST + component map it returns the same tree. No Astryx, no fetch, no daemon knowledge. Reused by SP6 for the Material structural-wireframe preview (different component map, same walker).

## Astryx component map (in the SPA)

Node type → real `@astryxdesign/core` component + prop adapter, because Astryx is not 1:1 with the catalog:

| AST node | Astryx render |
|---|---|
| `VStack` | `<Stack direction="vertical" gap={…}>` |
| `HStack` | `<Stack direction="horizontal" gap={…}>` |
| `Card` | `<Card>` |
| `Grid` | `<Grid columns={…}>` |
| `Heading` | `<Text>` at a heading size derived from `level` |
| `Text` | `<Text>` (variant from `type`) |
| `Button` | `<Button variant={…}>` |
| logic-bearing nodes (`Service`/`Method`/`Store`/`Action`/`Http`/`Endpoint`) | non-visual → rendered as a labeled structural placeholder (they carry no pixels; the preview shows their presence/shape) |

The SPA imports the **prebuilt** stylesheet `@astryxdesign/core/astryx.css` once and depends on the `@stylexjs/stylex` **runtime** (`stylex.props()` reads already-compiled styles). **No StyleX babel/compiler runs in the app build** — the app consumes a precompiled library, it does not author StyleX. A parity test asserts the map's node-type keys equal the bridge catalog's node types (the two Astryx faces stay in sync).

## The authoring daemon (`boyscout author`)

```
boyscout author --openui <file> --config <file> [--host 127.0.0.1] [--port <n>]
```

Starts a Hono server bound to loopback. Loads the `.openui` file and holds **working state**:
- the parsed AST (via `parseOpenui`, using the bridge registry for `paramsFor`),
- a **draft/approved overlay** keyed by feature id — **every feature starts `draft` (unapproved)**. (SP4a's `parseOpenui` defaults `approved:true` for the headless generate path; the daemon overrides to draft so the approval gate is meaningful. The `.openui` format itself carries no `approved` field — it is SP4b-owned working state, persisted into `spec.json` at commit.)

### HTTP API

Static assets (the built SPA) are served without a token so the page can load and read its token from the URL. Every `/api/*` route requires a valid Bearer token **and** passes the Origin check.

| Route | Body | Returns | Effect |
|---|---|---|---|
| `GET /api/state` | — | `{openui, ast, approvals, validation}` | none (read) |
| `POST /api/parse` | `{text}` | `{ok, ast?, errors:[{line,message}]}` | updates in-memory working AST; **no disk write**; drives live preview |
| `POST /api/approve` | `{featureId, approved}` | `{approvals}` | sets overlay; **editing a feature (a `parse` that changes it) resets it to draft** |
| `POST /api/commit` | — | `{written:[paths]}` or `{ok:false, violations}` | **gate**: all features approved **and** `validateSpec` ok → serialize canonical `spec.json` + `.openui` via `writeBytes` → write (path-shielded) → return paths |

Generation is **not** an endpoint. After commit, the operator runs `boyscout generate` (existing CLI) against the written `spec.json`.

## §21 Security (lands here — the daemon is the first HTTP surface)

Security is **not** deferred to SP8 (roadmap note); it lands the moment the daemon serves HTTP.

- **CSPRNG session token.** Generated at startup with `node:crypto` `randomBytes` (hex). §21 explicitly exempts the session token from the "no OS randomness" rule — that rule is scoped to generation/ID derivation, never the token. The launch prints `http://127.0.0.1:<port>/?t=<token>`; the SPA reads `?t=` on load, holds it in memory, and sends `Authorization: Bearer <token>` on every `/api` call. Missing/wrong token on `/api/*` → **401**.
- **Origin enforcement.** `/api/*` reject when an `Origin` header is present and does not equal the daemon's own origin (`http://<host>:<port>`) → **403**. Blocks DNS-rebinding and cross-site POSTs from a browser.
- **Loopback bind.** Default `127.0.0.1`. `0.0.0.0` only via an explicit `--host 0.0.0.0`.
- **Path shielding.** Request bodies carry **no filesystem paths** — the commit write target derives solely from the launch `--openui`/`--config` args. The resolved write path is asserted to stay within the project directory (reject any `..` escape). Static-asset serving resolves strictly within the SPA `dist/` directory.

## The SPA (`apps/boyscout-ui`)

React + Vite. On load: read `?t=` token → hold in memory. Layout: an **editor pane** (`.openui` text) beside a **preview pane** (`@boyscout/renderer` + Astryx map) and a **feature approval list**.

- Editing the text → debounced `POST /api/parse` → on `ok`, re-render the preview from the returned AST; on error, show line-numbered messages inline and keep the last good preview.
- Each feature shows a draft/approved toggle → `POST /api/approve`.
- A **"Write spec"** action → `POST /api/commit`; on success shows the written paths, on gate failure shows the violations (unapproved features or validation errors).

Vite is the first bundler in the monorepo (every other package is raw-TS, no build). It is unavoidable for a browser app; the SPA is the only unit with a build step, output to `apps/boyscout-ui/dist/`, which the daemon serves.

## Folded-in SP4a carry-forwards

Both were deferred at SP4a merge because SP4a's `generate` path drove only `component`; SP4b's surface triggers them.

1. **`.openui` `writeBytes` entrypoint + cross-OS golden.** SP4a's `serializeOpenui` returns a pure explicit-LF string and never imported `@boyscout/determinism` (its declared-but-unused dep). SP4b's `/api/commit` is the real `.openui` file-write entrypoint: route the serialized bytes through `writeBytes` (LF/UTF-8/no-BOM), and add a 3-OS `.openui` byte-identity golden to the existing matrix. `.openui` becomes determinism-covered, inside the byte-identity boundary.
2. **Logic-bearing codegen escaping.** `service-provider.ts`/`store-provider.ts`/`http-provider.ts` interpolate authored `name`/`params`/`returns`/`path` **unescaped** into generated TS bodies and file paths. SP4a closed only the `component` JSX path. SP4b's E2E authors service/store/http features with adversarial text (e.g. a `name`/`path` containing quotes/newlines/`..`), approves, and runs CLI `generate` — so these providers must escape (or reject) authored strings before emit. Proven by unit tests + a compiling golden.

## Testing

| Layer | Test |
|---|---|
| **Renderer units** | component snapshots over a curated AST corpus with a **mock** component map (deterministic, headless): nesting, text-child nodes, props pass-through, unknown-type fallback renders (no throw) |
| **Astryx map parity** | the map's node-type keys equal `bridge-astryx-react`'s catalog node types (the two Astryx faces stay in sync) |
| **Daemon HTTP** | Hono `app.request()` (no sockets): `/api/*` without token → 401; wrong token → 401; foreign `Origin` → 403; valid → 200; `parse` returns line-numbered errors on bad input; `approve` overlay + edit-resets-to-draft; `commit` gate rejects unapproved/invalid; `commit` writes byte-identical `spec.json` + `.openui`; path traversal on the launch arg rejected |
| **`.openui` cross-OS golden** | `writeBytes(serializeOpenui(spec))` byte-identical on Linux/macOS/Windows (existing 3-OS matrix) |
| **Escaping** | `service`/`store`/`http` providers escape (or reject) adversarial authored strings — unit cases + a compiling golden |
| **E2E (Playwright)** | launch daemon on an ephemeral port → open SPA with token → edit `.openui` → preview appears → approve all features → "Write spec" → assert `spec.json` on disk → run `boyscout generate` → assert byte-identical scaffolds. The roadmap's SP4 proof. |

Determinism tests stay law/golden-based (D3b). Playwright is the E2E harness pulled into v1 by D5/D9; it exercises the full authoring surface for the subset SP4b delivers (no questionnaire/SSE yet).

## Package layout

- **Create** `packages/renderer/` → `src/{renderer,index}.tsx` + `test/`. Raw-TS package (`exports: "./src/index.ts"`), `react` as a peer/dev dep, `@types/react`. No build step; consumed by the SPA's Vite build.
- **Create** `apps/boyscout-ui/` → Vite + React SPA; `src/{main,App,astryx-map,api}.tsx`, `index.html`, `vite.config.ts`; Playwright config + E2E spec. Only unit with a bundler.
- **Modify** `apps/cli` → add the `author` command (Hono daemon: routes, security middleware, working-state, commit). New deps: `hono`, `@boyscout/dialect`, `@boyscout/spec`, `@boyscout/determinism`.
- **Modify** `packages/bridges/bridge-astryx-react` → escaping in `service-provider.ts`/`store-provider.ts`/`http-provider.ts` (the folded carry-forward). No react added.
- **Modify** `@boyscout/dialect` (or the commit path) → route `.openui` bytes through `writeBytes` at the file-write entrypoint.
- **Test-only** in `apps/cli/test` (daemon HTTP + `.openui` golden + escaping golden) and `apps/boyscout-ui` (E2E).

## Determinism integration

`spec.json` and `.openui` are both written through `@boyscout/determinism` `writeBytes` (LF/UTF-8/no-BOM), the sanctioned path. Both are first-class persisted artifacts inside the byte-identity boundary, cross-OS golden-tested. The SPA's Vite bundle is a browser asset, **not** a determinism-covered artifact (it renders preview pixels, which §1.3 explicitly excludes from the byte guarantee).

## Deferred (explicit)

- **SP5:** closed questionnaire engine (`enabledWhen`), SSE live-workspace streaming, per-node annotations UI + context enrichment.
- **SP6:** the Material bridge reuses `@boyscout/renderer` with a wireframe component map (structural approximation, §1.3).
- **SP8:** `boyscout.lock` (transitive closure), matured cross-OS golden, full §21 checklist audit, hardening.
- `metadata.checksum` computation stays deferred and separately tracked.

## Invariants preserved

- **Agnosticism (§14.1):** `@boyscout/renderer` and the authoring daemon import no framework/react beyond the daemon's data-only bridge registry; `bridge-astryx-react` stays react-free; the generation Runtime is untouched. Only `apps/boyscout-ui` imports react + Astryx.
- **Determinism (D3a/D3b):** `spec.json` + `.openui` written via `writeBytes`, cross-OS golden-tested.
- **Double barrier (§10):** authoring input flows through the existing `validateSpec` pre-barrier (unchanged); the escaping fix closes the logic-bearing emit path; the post-barrier scaffold-only stage is unchanged.
- **Stage separation (§1.2 / D1):** the authoring daemon produces `spec.json` and never runs generation; `boyscout generate` (existing CLI) consumes it. The seam (D2d) is untouched.
- **Security (§21):** lands fully in SP4b — the first HTTP surface — not deferred.
