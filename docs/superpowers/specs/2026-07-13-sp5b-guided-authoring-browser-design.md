# SP5b — Guided Authoring Browser Layer (SSE + Questionnaire UI + Annotations) — Design

> Sub-project of BoyScout v1 (`docs/V1-ROADMAP.md`, decision **D9**). This is the **second half of SP5** (Guided Authoring), building the browser/streaming stack on top of the merged SP5a headless engine (`@boyscout/questionnaire`) and the SP4b authoring front-end (daemon + SPA). Mirrors the SP4a/SP4b split. Builds on merged SP1 + SP2 + SP3 + SP4a + SP4b + SP5a.

## Goal

Wire the closed deterministic questionnaire into the browser: an **Astryx-rendered questionnaire form** whose answers drive `compose()`; the composed features **stream to the live preview over SSE**; **per-node annotations** enrich the composed spec's context. The composed `.openui` seeds the existing SP4b editor, and everything downstream (approve → commit → generate) is the unchanged SP4b path.

This delivers the full SP5 roadmap proof — "closed questionnaire drives composition; features stream via SSE to live preview; per-node annotations enrich context" — headlessly proven in SP5a and now surfaced in the UI.

## Scope decision (why SP5b, not all of SP5)

SP5a delivered the headless engine (`parseQuestionnaire`, `enabledQuestions`, `compose`) — property- and golden-tested, no browser. SP5b delivers the browser/streaming layer that consumes it. All three roadmap clauses are in scope (confirmed in brainstorming): the questionnaire UI, SSE streaming, and per-node annotations.

**In SP5b:** a guided-authoring mode in the daemon + SPA — `--questionnaire` wiring, `GET /api/questionnaire`, `POST /api/compose` (SSE), `POST /api/annotate`, an Astryx-rendered live form, streaming preview, per-node annotation UI, annotation merge at commit, and the guided-flow Playwright E2E.

**Not in SP5b:** any new core package (SP5a already shipped the engine); changes to the `.openui` DSL grammar or SP4a's byte-stable round-trip (explicitly avoided — see §4); a second bridge (SP6); parallel execution (SP7).

## Architecture — additive front door onto SP4b

SP5b adds **no new package**. It wires `@boyscout/questionnaire` into the existing daemon and SPA. Guided mode is opt-in: pass `--questionnaire <file>` and the SPA shows the form pane; omit it and the daemon is exactly the SP4b editor.

```
questionnaire.yaml ──(startup)──▶ daemon parses it once (parseQuestionnaire; throw → exit 1)
        │
   GET /api/questionnaire ─▶ SPA renders an Astryx form (live, enabledWhen-driven)
        │
   answer change ─(debounced POST answers)─▶ POST /api/compose  [SSE, text/event-stream]
        │                                        server: compose(q, answers, registry)
        │                                        ├─ ok:  one `feature` event per composed feature,
        │                                        │        then `done` { openui, spec }
        │                                        └─ !ok: `violations` event { violations: string[] }
        ▼
   preview builds up live ─▶ `done` seeds the editor text + spec + approvals (reuses SP4b reparse path)
        │
   per-node annotation outline ─(POST /api/annotate)─▶ side-car map (§3)
        │
   existing SP4b approve ─▶ commit ─▶ spec.json (+ merged annotations)
```

**Everything after "seed the editor" is the unchanged SP4b flow.** The questionnaire is a closed generator of the editor's initial `.openui`; the composed spec is byte-stable and round-trippable by construction (SP5a guarantee), so `compose → serializeOpenui → editor text → reparse` yields the same spec.

## Components

### Daemon (`apps/cli/src/author/`)

- **`command.ts`** — new `--questionnaire <file>` flag. If present, read the file and `parseQuestionnaire(yaml)` at startup; a `QuestionnaireError` prints to stderr and exits 1 (mirrors the existing bind-error path). The parsed questionnaire is passed into `createAuthApp`. The daemon already imports the matching astryx `registry`; the questionnaire's `bridge`/`platform` header must match it, and a mismatch surfaces as a normal compose/gate violation.
- **`guided.ts`** (new) — registers, under the existing `/api/*` auth+origin middleware:
  - `GET /api/questionnaire` → the parsed questionnaire JSON (or `404` if none was configured).
  - `POST /api/compose` → **SSE** (`content-type: text/event-stream`). Body: `{ answers }`. Runs `compose(questionnaire, answers, registry)`. On `ok`: emit one `event: feature\ndata: <feature JSON>` per composed feature (declaration order), then `event: done\ndata: { openui, spec }` where `openui = serializeOpenui(spec, registry)`. On `!ok`: emit `event: violations\ndata: { violations }`. The `done` path updates session `spec`/`openui`/`approvals` through the same reparse logic SP4b already uses, so the editor and approval state stay consistent.
  - `POST /api/annotate` → body `{ featureId, path, note }`. Writes/clears the side-car annotation (empty `note` clears). Returns the current annotations for that feature.
- **`app.ts`** — `AuthAppOptions` gains `questionnaire?: QuestionnaireT`; session state gains `annotations: Record<string, Record<string, { note: string; sig: string }>>` (featureId → pathKey → note+signature). The existing `reparse` is extended to prune annotations whose node signature no longer matches (§3). `guided.ts` routes are registered alongside the existing ones.

### Rendering (`apps/boyscout-ui/src/`)

- **`questionnaire-tree.ts`** — `questionnaireToTree(questionnaire: QuestionnaireT, answers: AnswersT)`: builds a plain Astryx tree (`Form > Question > RadioGroup|CheckboxGroup > Option`) covering only `enabledQuestions(questionnaire, answers)`, with each option's selected state derived from `answers`. Pure function of `(questionnaire, answers)`.
- **`form-components.tsx`** — a **form component map** for those node types plus an `AnswerContext { answers, onAnswer }`. The existing `<Renderer/>` is reused **unchanged**: the form is "Astryx-rendered" by feeding the Renderer this component map instead of `astryxMap`; the widgets read/write answers through the context. No bridge-registry change, no Renderer change — the form tree is an internal rendering artifact, never a parsed/validated/committed `.openui` document.
- **`sse.ts`** — a small fetch-POST reader that parses `text/event-stream` frames into `{ event, data }` and invokes a callback per frame. Needed because `EventSource` is GET-only and answers must POST.

### SPA (`App.tsx`, `api.ts`)

- **`api.ts`** — client gains `questionnaire()` (GET), `composeStream(answers, onEvent)` (POST + SSE reader), and `annotate(featureId, path, note)` (POST).
- **`App.tsx`** — on load, `GET /api/questionnaire`; if present, render **guided mode**: left pane = the Astryx form (`<Renderer ast={questionnaireToTree(q, answers)} components={formComponents}/>` inside an `AnswerContext`), right pane = live preview. An answer change debounces a `composeStream(answers)` call; `feature` events append to the preview, `done` seeds the editor (`text`/`features`/`approvals`), `violations` shows the list and does not seed. Below the preview, a **per-node annotation outline** — an indented list of the composed feature tree by path with a note `<input>` per node — calls `annotate` on change. The existing approve checkboxes + commit button are unchanged. If no questionnaire is configured, `App.tsx` renders exactly the SP4b editor.

## Per-node annotations — addressing & persistence

- **Address** — a positional path within a feature's tree: dot-joined child indices from the feature root (root of a feature's `tree` = `""`, its first child = `"0"`, that child's third child = `"0.2"`, …). A `pathKey` is `""` for the feature-root node or a dot path for any descendant.
- **Persistence** — a **side-car** in daemon session state, keyed `featureId → pathKey → { note, sig }`, where `sig = hash(writeBytes(canonicalJson(node)))` for the node at that path (the same `hash`/`writeBytes`/`canonicalJson` primitives the approval-carry logic already uses). On every recompose/reparse, an annotation is **kept only if the node currently at that `(featureId, pathKey)` still hashes to `sig`**; otherwise it is dropped. This mirrors exactly how per-feature approvals survive a reparse today. Changed subtrees drop their annotations — expected and consistent.
- **Commit** — annotations merge into `spec.features[i].annotations` as a `Record<pathKey, note>` (the note strings only; `sig` is session-internal) before `spec.json` is written. The `.openui` text and SP4a's parser/serializer/byte-golden are **never touched** — annotations live only in the spec JSON, exactly as the existing (empty) `annotations` field already does.

## Error handling

| Condition | Behaviour |
|---|---|
| Malformed questionnaire at startup | `QuestionnaireError` → stderr message → `process.exit(1)` (mirrors bind-error path) |
| `compose` returns `!ok` | `violations` SSE event → SPA lists violations, does not seed the editor |
| Answer to a disabled/unknown question | Handled inside `compose` per SP5a (disabled ignored, unknown → violation) — surfaces via the `violations` event |
| `annotate` on unknown feature/path | Ignored, returns current annotations (mirrors `approve` on an unknown feature id) |
| SSE stream/network error | SPA surfaces a stream error; last good editor/preview state retained |
| `GET /api/questionnaire` when none configured | `404`; SPA falls back to plain SP4b editor mode |

## Testing

- **Unit — `questionnaireToTree`**: only `enabledQuestions` appear; single-answer reflected as selected radio, multi as checked boxes; an `enabledWhen` cascade (answering a gating question adds/removes a dependent question's subtree).
- **Unit — annotation side-car**: an annotation is preserved across a reparse when its node subtree hash is unchanged, and dropped when the subtree changes; `annotate` with empty note clears.
- **Unit — compose SSE handler**: given a questionnaire + answers, the handler emits the expected `feature` events (declaration order) followed by `done` with `openui`+`spec`; an incomplete/invalid answer set emits a single `violations` event and no `feature`/`done`.
- **Playwright E2E (the SP5 proof)** — guided flow, deterministic token (`BOYSCOUT_AUTH_TOKEN`) as in SP4b: load guided mode → answer a gating question → a dependent question appears (enabledWhen cascade) → the preview streams composed features in → add an annotation to a node → the composed `.openui` seeds the editor → approve all features → commit → assert `spec.json` contains the composed features **and** the annotation under the right feature. A second E2E asserts the violations path (an answer set that fails the 422 gate shows violations and does not seed).

No new cross-OS golden matrix is needed: byte-identity of the composed spec is already guaranteed by SP5a (which routes through SP4a's cross-OS `.openui` golden). SP5b tests the browser wiring, not determinism.

## File structure

- `apps/cli/src/author/command.ts` — add `--questionnaire` flag + startup parse (modify).
- `apps/cli/src/author/app.ts` — questionnaire option + annotations session state + reparse pruning (modify).
- `apps/cli/src/author/guided.ts` — `GET /api/questionnaire`, `POST /api/compose` (SSE), `POST /api/annotate` (create).
- `apps/cli/src/author/commit.ts` — merge annotations into `spec.features[].annotations` at commit (modify).
- `apps/boyscout-ui/src/questionnaire-tree.ts` — `questionnaireToTree` (create).
- `apps/boyscout-ui/src/form-components.tsx` — form component map + `AnswerContext` (create).
- `apps/boyscout-ui/src/sse.ts` — fetch-POST SSE frame reader (create).
- `apps/boyscout-ui/src/api.ts` — `questionnaire`, `composeStream`, `annotate` client methods (modify).
- `apps/boyscout-ui/src/App.tsx` — guided-mode layout + live compose + annotation outline (modify).
- `apps/cli/test/**` + `apps/boyscout-ui/test/**` — unit tests above; `apps/cli/e2e/**` (or the existing E2E location) — guided-flow Playwright E2E.

## Non-goals (SP5b)

- Any change to the `.openui` DSL grammar or SP4a's both-directions byte-stable round-trip (annotations are a spec-JSON side-car, §4).
- Click-on-rendered-node annotation targeting (the annotation UI is a path outline; visual-click needs Renderer node-path DOM hooks — a clean later upgrade).
- A persistent multi-event workspace SSE channel (file-watch, multi-tab sync). SSE here is a per-compose stream only.
- New bridge node types / registry / guardrail changes — the form is rendered via a UI-side component map, not registered Astryx capabilities.
- `metadata.checksum` computation — remains separately tracked/deferred (as in SP4/SP5a).
