# SP5b — Guided Authoring Browser Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the SP5a `@boyscout/questionnaire` engine into the browser — an Astryx-rendered questionnaire form whose answers stream `compose()` output to the live preview over SSE, plus per-node annotations — with the composed `.openui` seeding the existing SP4b editor/approve/commit flow.

**Architecture:** Additive front door onto the SP4b daemon + SPA. No new package. The daemon parses a `--questionnaire` file at startup and exposes `GET /api/questionnaire`, `POST /api/compose` (SSE), and `POST /api/annotate`; the SPA renders the questionnaire through the existing `<Renderer/>` with a form-specific component map, debounce-composes on each answer, and seeds the editor from the `done` event. Annotations live as a session-state side-car keyed by feature-id + positional node path, merged into `spec.features[].annotations` at commit — the `.openui` DSL and SP4a's round-trip are never touched.

**Tech Stack:** TypeScript (strict), React 19, Hono + `hono/streaming` `streamSSE`, Vitest, Playwright, `@boyscout/questionnaire`, `@boyscout/dialect`, `@boyscout/renderer`, `@boyscout/schemas`.

## Global Constraints

- No new core package: SP5b wires `@boyscout/questionnaire` into the daemon (`apps/cli`) and SPA (`apps/boyscout-ui`).
- Do NOT change the `.openui` DSL grammar or SP4a's byte-stable round-trip. Annotations are a **spec-JSON side-car only**.
- SSE `POST /api/compose` emits, in order, one `event: feature` per composed feature then `event: done` with `{ openui, spec }`; on failure a single `event: violations` with `{ violations: string[] }` and nothing else.
- The questionnaire form is rendered by feeding the **existing** `<Renderer/>` a UI-side component map — no `bridge-astryx-react` registry change, no `renderer` change.
- Annotation address = positional path: dot-joined child indices from a feature's tree root; `""` = the feature-root node, `"0.2"` = `tree.children[0].children[2]`.
- Annotation persistence: session map keyed `featureId → pathKey → { note, sig }`, `sig = hash(writeBytes(canonicalJson(node)))`. On every reparse, an annotation is kept only if the node at that path still hashes to `sig` (mirrors the approval-carry logic already in `app.ts`). Merged into `spec.features[i].annotations` (notes only) at commit.
- Guided mode is opt-in via `--questionnaire <file>`; a malformed questionnaire prints to stderr and returns exit code 1 (mirrors the bind-error path already in `command.ts`).
- All `/api/*` routes stay behind the existing Bearer-token + Origin middleware in `app.ts` (unchanged).
- Strict TS: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` — use `import type` for type-only imports, `.js` specifiers on relative imports, conditional spread for optional props.
- Tests run per-file: `npx vitest run <path>` (there is NO per-package `test` script). Typecheck with `pnpm --filter <pkg> typecheck`. Do NOT run `biome lint` locally (it OOMs; CI is authoritative).
- Package names: SPA = `boyscout-ui`, CLI = `@boyscout/cli`, engine = `@boyscout/questionnaire`.

---

### Task 1: `questionnaireToTree` + answer/path helpers (SPA, pure)

**Files:**
- Modify: `packages/questionnaire/src/index.ts` (re-export `enabledQuestions`)
- Modify: `apps/boyscout-ui/package.json` (add `@boyscout/questionnaire` dependency)
- Create: `apps/boyscout-ui/src/questionnaire-tree.ts`
- Test: `apps/boyscout-ui/test/questionnaire-tree.test.ts`

**Interfaces:**
- Consumes: `enabledQuestions(q: QuestionnaireT, answers: AnswersT): QuestionT[]` from `@boyscout/questionnaire`; `AstNodeT`, `AnswersT`, `QuestionnaireT` from `@boyscout/schemas`.
- Produces:
  - `questionnaireToTree(q: QuestionnaireT, answers: AnswersT): AstNodeT` — a `Form > Question > Option` tree of enabled questions.
  - `toggleAnswer(answers: AnswersT, qid: string, value: string, kind: string): AnswersT` — pure next-answers (single sets, multi toggles).
  - `flattenPaths(tree: AstNodeT, prefix?: string): { pathKey: string; type: string }[]` — every node's positional path + type.

- [ ] **Step 1: Re-export `enabledQuestions` from the engine barrel**

In `packages/questionnaire/src/index.ts`, add near the other exports (after the `QuestionnaireError` class or at the top of the export section):

```ts
export { enabledQuestions } from "./enabled.js";
```

- [ ] **Step 2: Add the engine as a SPA dependency**

In `apps/boyscout-ui/package.json`, add to `"dependencies"` (keep alphabetical with the other `@boyscout/*` entries):

```json
    "@boyscout/questionnaire": "workspace:*",
```

Then install: `pnpm install` (from repo root). Expected: lockfile updates, no errors.

- [ ] **Step 3: Write the failing test**

Create `apps/boyscout-ui/test/questionnaire-tree.test.ts`:

```ts
import type { QuestionnaireT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { flattenPaths, questionnaireToTree, toggleAnswer } from "../src/questionnaire-tree.js";

const Q: QuestionnaireT = {
  bridge: "astryx-react",
  platform: "react",
  questions: [
    {
      id: "screen",
      type: "single",
      prompt: "Screen type?",
      options: [
        { value: "login", contributes: { id: "login-card", capability: "component", openui: 'Card { Heading(3, "Sign in") }' } },
        { value: "dashboard", contributes: { id: "dash", capability: "component", openui: 'Card { Grid(2) { Heading(3, "Overview") } }' } },
      ],
    },
    {
      id: "sections",
      type: "multi",
      prompt: "Which sections?",
      enabledWhen: { screen: ["dashboard"] },
      options: [
        { value: "header", contributes: { id: "header-bar", capability: "component", openui: 'Card { Heading(2, "Header") }' } },
      ],
    },
  ],
};

describe("questionnaireToTree", () => {
  it("emits only enabled questions and reflects the cascade", () => {
    const before = questionnaireToTree(Q, {});
    expect(before.type).toBe("Form");
    expect(before.children?.map((c) => c.props?.qid)).toEqual(["screen"]);

    const after = questionnaireToTree(Q, { screen: "dashboard" });
    expect(after.children?.map((c) => c.props?.qid)).toEqual(["screen", "sections"]);
    const screen = after.children?.[0];
    expect(screen?.type).toBe("Question");
    expect(screen?.props).toMatchObject({ qid: "screen", prompt: "Screen type?", kind: "single" });
    expect(screen?.children?.map((o) => o.props?.value)).toEqual(["login", "dashboard"]);
    expect(screen?.children?.[0]?.props).toMatchObject({ qid: "screen", value: "login", kind: "single" });
  });
});

describe("toggleAnswer", () => {
  it("single sets, multi toggles", () => {
    expect(toggleAnswer({}, "screen", "login", "single")).toEqual({ screen: "login" });
    expect(toggleAnswer({ screen: "login" }, "screen", "dashboard", "single")).toEqual({ screen: "dashboard" });
    expect(toggleAnswer({}, "sections", "header", "multi")).toEqual({ sections: ["header"] });
    expect(toggleAnswer({ sections: ["header"] }, "sections", "header", "multi")).toEqual({ sections: [] });
    expect(toggleAnswer({ sections: ["header"] }, "sections", "footer", "multi")).toEqual({ sections: ["header", "footer"] });
  });
});

describe("flattenPaths", () => {
  it("lists every node's positional path and type", () => {
    const tree = { type: "Card", children: [{ type: "Heading" }, { type: "Grid", children: [{ type: "Text" }] }] };
    expect(flattenPaths(tree)).toEqual([
      { pathKey: "", type: "Card" },
      { pathKey: "0", type: "Heading" },
      { pathKey: "1", type: "Grid" },
      { pathKey: "1.0", type: "Text" },
    ]);
  });
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `npx vitest run apps/boyscout-ui/test/questionnaire-tree.test.ts`
Expected: FAIL — cannot resolve `../src/questionnaire-tree.js`.

- [ ] **Step 5: Implement**

Create `apps/boyscout-ui/src/questionnaire-tree.ts`:

```ts
import { enabledQuestions } from "@boyscout/questionnaire";
import type { AnswersT, AstNodeT, QuestionnaireT } from "@boyscout/schemas";

/** Build a Form>Question>Option tree of the enabled questions. Structure is a pure function of (q, answers). */
export function questionnaireToTree(q: QuestionnaireT, answers: AnswersT): AstNodeT {
  return {
    type: "Form",
    children: enabledQuestions(q, answers).map((question) => ({
      type: "Question",
      props: { qid: question.id, prompt: question.prompt, kind: question.type },
      children: question.options.map((o) => ({
        type: "Option",
        props: { qid: question.id, value: o.value, kind: question.type },
      })),
    })),
  };
}

/** Next answers after clicking an option: single replaces, multi toggles membership. */
export function toggleAnswer(answers: AnswersT, qid: string, value: string, kind: string): AnswersT {
  if (kind === "single") return { ...answers, [qid]: value };
  const cur = answers[qid];
  const list = Array.isArray(cur) ? cur : [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...answers, [qid]: next };
}

/** Every node's positional path (dot-joined child indices; "" = root) and type, pre-order. */
export function flattenPaths(tree: AstNodeT, prefix = ""): { pathKey: string; type: string }[] {
  const out = [{ pathKey: prefix, type: tree.type }];
  (tree.children ?? []).forEach((c, i) =>
    out.push(...flattenPaths(c, prefix === "" ? String(i) : `${prefix}.${i}`)),
  );
  return out;
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run apps/boyscout-ui/test/questionnaire-tree.test.ts`
Expected: PASS (3 suites).
Run: `pnpm --filter boyscout-ui typecheck && pnpm --filter @boyscout/questionnaire typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/questionnaire/src/index.ts apps/boyscout-ui/package.json pnpm-lock.yaml apps/boyscout-ui/src/questionnaire-tree.ts apps/boyscout-ui/test/questionnaire-tree.test.ts
git commit -m "feat(sp5b): questionnaireToTree + answer/path helpers; export enabledQuestions"
```

---

### Task 2: Astryx form component map + AnswerContext (SPA)

**Files:**
- Create: `apps/boyscout-ui/src/form-components.tsx`
- Test: `apps/boyscout-ui/test/form-components.test.tsx`

**Interfaces:**
- Consumes: the `Form`/`Question`/`Option` node shapes from Task 1 (`Option` props: `{ qid, value, kind }`); `ComponentMap`, `NodeComponent` from `@boyscout/renderer`; `AnswersT` from `@boyscout/schemas`.
- Produces:
  - `AnswerContext` — React context of `{ answers: AnswersT; onAnswer: (qid: string, value: string, kind: string) => void }`.
  - `formComponents: ComponentMap` — renders `Form`/`Question`/`Option` as `<div>`/`<fieldset>`/`<label><input>`, wiring inputs to the context.

- [ ] **Step 1: Write the failing test**

Create `apps/boyscout-ui/test/form-components.test.tsx`:

```tsx
import { Renderer } from "@boyscout/renderer";
import type { AstNodeT } from "@boyscout/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnswerContext, formComponents } from "../src/form-components.js";
import { questionnaireToTree } from "../src/questionnaire-tree.js";
import type { QuestionnaireT } from "@boyscout/schemas";

const Q: QuestionnaireT = {
  bridge: "astryx-react",
  platform: "react",
  questions: [
    { id: "screen", type: "single", prompt: "Screen?", options: [
      { value: "login", contributes: { id: "a", capability: "component", openui: "Card {}" } },
      { value: "dashboard", contributes: { id: "b", capability: "component", openui: "Card {}" } },
    ] },
  ],
};

function html(ast: AstNodeT, answers: Record<string, string | string[]>): string {
  return renderToStaticMarkup(
    createElement(AnswerContext.Provider, { value: { answers, onAnswer: () => {} } },
      createElement(Renderer, { ast, components: formComponents })),
  );
}

describe("formComponents", () => {
  it("renders single as radios and marks the selected one checked", () => {
    const out = html(questionnaireToTree(Q, { screen: "dashboard" }), { screen: "dashboard" });
    expect(out).toContain('type="radio"');
    expect(out).toContain("Screen?");
    // exactly one radio is checked, and it is the dashboard input (its testid precedes `checked`)
    expect((out.match(/checked=""/g) ?? []).length).toBe(1);
    const dashInput = out.slice(out.indexOf("opt-screen-dashboard"), out.indexOf("opt-screen-dashboard") + 60);
    expect(dashInput).toContain("checked");
  });

  it("renders multi options as checkboxes", () => {
    const multi: QuestionnaireT = { ...Q, questions: [{ ...Q.questions[0]!, type: "multi" }] };
    const out = html(questionnaireToTree(multi, {}), {});
    expect(out).toContain('type="checkbox"');
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/boyscout-ui/test/form-components.test.tsx`
Expected: FAIL — cannot resolve `../src/form-components.js`.

- [ ] **Step 3: Implement**

Create `apps/boyscout-ui/src/form-components.tsx`:

```tsx
import type { ComponentMap, NodeComponent } from "@boyscout/renderer";
import type { AnswersT } from "@boyscout/schemas";
import { createContext, useContext } from "react";

export interface AnswerCtx {
  answers: AnswersT;
  onAnswer: (qid: string, value: string, kind: string) => void;
}
export const AnswerContext = createContext<AnswerCtx>({ answers: {}, onAnswer: () => {} });

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function isChecked(answers: AnswersT, qid: string, value: string): boolean {
  const a = answers[qid];
  return Array.isArray(a) ? a.includes(value) : a === value;
}

const FormNode: NodeComponent = ({ children }) => (
  <div data-testid="questionnaire-form">{children}</div>
);

const QuestionNode: NodeComponent = ({ node, children }) => (
  <fieldset data-qid={str(node.props?.qid)}>
    <legend>{str(node.props?.prompt)}</legend>
    {children}
  </fieldset>
);

const OptionNode: NodeComponent = ({ node }) => {
  const { answers, onAnswer } = useContext(AnswerContext);
  const qid = str(node.props?.qid);
  const value = str(node.props?.value);
  const kind = str(node.props?.kind);
  return (
    <label style={{ display: "block" }}>
      <input
        type={kind === "single" ? "radio" : "checkbox"}
        name={qid}
        data-testid={`opt-${qid}-${value}`}
        checked={isChecked(answers, qid, value)}
        onChange={() => onAnswer(qid, value, kind)}
      />
      {value}
    </label>
  );
};

export const formComponents: ComponentMap = {
  Form: FormNode,
  Question: QuestionNode,
  Option: OptionNode,
};
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run apps/boyscout-ui/test/form-components.test.tsx`
Expected: PASS.
Run: `pnpm --filter boyscout-ui typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/boyscout-ui/src/form-components.tsx apps/boyscout-ui/test/form-components.test.tsx
git commit -m "feat(sp5b): Astryx form component map + AnswerContext"
```

---

### Task 3: fetch-POST SSE reader (SPA, pure)

**Files:**
- Create: `apps/boyscout-ui/src/sse.ts`
- Test: `apps/boyscout-ui/test/sse.test.ts`

**Interfaces:**
- Produces:
  - `parseFrame(frame: string): SseEvent | null` where `SseEvent = { event: string; data: string }`.
  - `postSse(path, body, headers, onEvent, fetchImpl?): Promise<void>` — POSTs JSON, reads a `text/event-stream` response body, invokes `onEvent` per frame.

- [ ] **Step 1: Write the failing test**

Create `apps/boyscout-ui/test/sse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFrame, postSse, type SseEvent } from "../src/sse.js";

describe("parseFrame", () => {
  it("extracts event + data, defaults event to message", () => {
    expect(parseFrame("event: feature\ndata: {\"id\":\"a\"}")).toEqual({ event: "feature", data: '{"id":"a"}' });
    expect(parseFrame("data: hi")).toEqual({ event: "message", data: "hi" });
    expect(parseFrame(": comment only")).toBeNull();
  });
});

describe("postSse", () => {
  it("streams frames from the response body to onEvent", async () => {
    const body = "event: feature\ndata: 1\n\nevent: done\ndata: {\"ok\":true}\n\n";
    const fakeFetch = (async () =>
      new Response(new ReadableStream({
        start(ctrl) { ctrl.enqueue(new TextEncoder().encode(body)); ctrl.close(); },
      }), { headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;

    const events: SseEvent[] = [];
    await postSse("/api/compose", { answers: {} }, {}, (e) => events.push(e), fakeFetch);
    expect(events).toEqual([
      { event: "feature", data: "1" },
      { event: "done", data: '{"ok":true}' },
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/boyscout-ui/test/sse.test.ts`
Expected: FAIL — cannot resolve `../src/sse.js`.

- [ ] **Step 3: Implement**

Create `apps/boyscout-ui/src/sse.ts`:

```ts
export interface SseEvent {
  event: string;
  data: string;
}

/** Parse one SSE frame (lines between blank-line separators). Returns null if it carries no data. */
export function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/** POST a JSON body and read the text/event-stream response, invoking onEvent per frame. */
export async function postSse(
  path: string,
  body: unknown,
  headers: Record<string, string>,
  onEvent: (e: SseEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(path, { method: "POST", headers, body: JSON.stringify(body) });
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const e = parseFrame(buf.slice(0, idx));
      if (e) onEvent(e);
      buf = buf.slice(idx + 2);
      idx = buf.indexOf("\n\n");
    }
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run apps/boyscout-ui/test/sse.test.ts`
Expected: PASS.
Run: `pnpm --filter boyscout-ui typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/boyscout-ui/src/sse.ts apps/boyscout-ui/test/sse.test.ts
git commit -m "feat(sp5b): fetch-POST SSE frame reader"
```

---

### Task 4: Annotations side-car + `/api/annotate` + commit merge (daemon)

**Files:**
- Modify: `apps/cli/src/author/app.ts` (annotations state, `nodeAtPath`/`nodeSig`, reparse pruning + empty-text guard, `/api/annotate`, snapshot)
- Modify: `apps/cli/src/author/commit.ts` (merge annotations into `spec.features[].annotations`)
- Test: `apps/cli/test/author-annotate.test.ts`

**Interfaces:**
- Consumes: `canonicalJson`, `hash`, `writeBytes` from `@boyscout/determinism` (already imported in `app.ts`); `AstNodeT`, `SpecificationT` from `@boyscout/schemas`.
- Produces:
  - Session state `annotations: Record<string, Record<string, { note: string; sig: string }>>` (featureId → pathKey → note+signature).
  - `POST /api/annotate` body `{ featureId, path, note }` → `{ annotations: Record<pathKey, string> }` for that feature (empty `note` clears).
  - `AuthState.annotations: Record<string, Record<string, string>>` in the snapshot (notes only).
  - `registerCommit(..., getAnnotations)` merges notes into `spec.features[i].annotations` before writing.

- [ ] **Step 1: Write the failing test**

Create `apps/cli/test/author-annotate.test.ts`:

```ts
import { registry } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { type AuthState, createAuthApp } from "../src/author/app.js";

const TOKEN = "test-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make() {
  return createAuthApp({
    registry, token: TOKEN, selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: OPENUI, specPath: "/tmp/x/spec.json", openuiPath: "/tmp/x/b.openui", projectRoot: "/tmp/x",
  });
}
const annotate = (app: ReturnType<typeof make>["app"], body: unknown) =>
  app.request("/api/annotate", { method: "POST", headers: auth, body: JSON.stringify(body) });
const parse = (app: ReturnType<typeof make>["app"], text: string) =>
  app.request("/api/parse", { method: "POST", headers: auth, body: JSON.stringify({ text }) });
const state = async (app: ReturnType<typeof make>["app"]) =>
  (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;

describe("annotations side-car", () => {
  it("stores a note at a node path and returns it in state", async () => {
    const { app } = make();
    const res = await annotate(app, { featureId: "card", path: "0", note: "the text node" });
    expect(((await res.json()) as { annotations: Record<string, string> }).annotations).toEqual({ "0": "the text node" });
    expect((await state(app)).annotations).toEqual({ card: { "0": "the text node" } });
  });

  it("survives a reparse that leaves the node unchanged, drops when the node changes", async () => {
    const { app } = make();
    await annotate(app, { featureId: "card", path: "0", note: "n" });
    await parse(app, OPENUI.replace("Card {", "Card { \n")); // whitespace-only: canonical tree unchanged
    expect((await state(app)).annotations).toEqual({ card: { "0": "n" } });
    await parse(app, OPENUI.replace('"hello"', '"changed"')); // node 0 changes -> drop
    expect((await state(app)).annotations).toEqual({});
  });

  it("empty note clears the annotation", async () => {
    const { app } = make();
    await annotate(app, { featureId: "card", path: "0", note: "n" });
    await annotate(app, { featureId: "card", path: "0", note: "" });
    expect((await state(app)).annotations).toEqual({});
  });

  it("ignores an unknown feature or path", async () => {
    const { app } = make();
    await annotate(app, { featureId: "nope", path: "0", note: "n" });
    await annotate(app, { featureId: "card", path: "9.9", note: "n" });
    expect((await state(app)).annotations).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/cli/test/author-annotate.test.ts`
Expected: FAIL — `/api/annotate` returns 404, `state.annotations` is undefined.

- [ ] **Step 3: Implement `app.ts` changes**

In `apps/cli/src/author/app.ts`:

(a) Extend `AuthState` (both the exported interface here and the one in `apps/boyscout-ui/src/api.ts` in Task 6) — add the annotations field:

```ts
export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
  annotations: Record<string, Record<string, string>>;
}
```

(b) Add an `AstNodeT` import and the annotations state + helpers. Change the import line to include `AstNodeT`:

```ts
import type { AstNodeT, SpecificationT } from "@boyscout/schemas";
```

Add beside the other `let` state declarations (after `let sigs`):

```ts
  let annotations: Record<string, Record<string, { note: string; sig: string }>> = {};

  const nodeAtPath = (tree: AstNodeT, pathKey: string): AstNodeT | undefined => {
    if (pathKey === "") return tree;
    let node: AstNodeT | undefined = tree;
    for (const seg of pathKey.split(".")) node = node?.children?.[Number(seg)];
    return node;
  };
  const nodeSig = (node: AstNodeT): string => hash(writeBytes(canonicalJson(node)));
  const notesAll = (): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {};
    for (const [fid, map] of Object.entries(annotations)) {
      const notes: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) notes[k] = v.note;
      out[fid] = notes;
    }
    return out;
  };
```

(c) In `reparse`, add an empty-text guard at the top and annotation pruning in the success branch. Replace the body of `reparse` with:

```ts
  function reparse(text: string): void {
    if (text.trim() === "") {
      openui = "";
      spec = null;
      approvals = {};
      sigs = {};
      annotations = {};
      errors = [];
      return;
    }
    try {
      const next = parseOpenui(text, registry);
      const nextApprovals: Record<string, boolean> = {};
      const nextSigs: Record<string, string> = {};
      for (const f of next.features) {
        const s = hash(writeBytes(canonicalJson(f.tree)));
        nextSigs[f.id] = s;
        nextApprovals[f.id] = sigs[f.id] === s ? (approvals[f.id] ?? false) : false;
      }
      // carry each annotation only if the node at its path still hashes the same
      const nextAnnotations: typeof annotations = {};
      for (const f of next.features) {
        const existing = annotations[f.id];
        if (!existing) continue;
        const kept: Record<string, { note: string; sig: string }> = {};
        for (const [pathKey, ann] of Object.entries(existing)) {
          const node = nodeAtPath(f.tree, pathKey);
          if (node && nodeSig(node) === ann.sig) kept[pathKey] = ann;
        }
        if (Object.keys(kept).length > 0) nextAnnotations[f.id] = kept;
      }
      openui = text;
      spec = next;
      approvals = nextApprovals;
      sigs = nextSigs;
      annotations = nextAnnotations;
      errors = [];
    } catch (e) {
      errors = [{ line: e instanceof DialectError ? e.line : 0, message: (e as Error).message }];
      openui = text;
    }
  }
```

(d) Update `snapshot` to include annotations:

```ts
  const snapshot = (): AuthState => ({ openui, ast: spec, approvals, errors, annotations: notesAll() });
```

(e) Add the `/api/annotate` route (after the `/api/approve` route, before `registerCommit`):

```ts
  app.post("/api/annotate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      featureId?: unknown;
      path?: unknown;
      note?: unknown;
    };
    const featureId = typeof body.featureId === "string" ? body.featureId : "";
    const path = typeof body.path === "string" ? body.path : "";
    const note = typeof body.note === "string" ? body.note : "";
    const feature = spec?.features.find((f) => f.id === featureId);
    const node = feature ? nodeAtPath(feature.tree, path) : undefined;
    if (feature && node) {
      const map = (annotations[featureId] ??= {});
      if (note === "") delete map[path];
      else map[path] = { note, sig: nodeSig(node) };
      if (Object.keys(map).length === 0) delete annotations[featureId];
    }
    return c.json({ annotations: notesAll()[featureId] ?? {} });
  });
```

(f) Pass annotations into `registerCommit`:

```ts
  registerCommit(
    app,
    opts,
    () => spec,
    () => approvals,
    () => annotations,
    registry,
  );
```

- [ ] **Step 4: Implement `commit.ts` merge**

In `apps/cli/src/author/commit.ts`, add the `getAnnotations` parameter and merge before writing. Replace `registerCommit`'s signature and the write section:

```ts
export function registerCommit(
  app: Hono,
  opts: AuthAppOptions,
  getSpec: () => SpecificationT | null,
  getApprovals: () => Record<string, boolean>,
  getAnnotations: () => Record<string, Record<string, { note: string; sig: string }>>,
  registry: DialectRegistry,
): void {
  app.post("/api/commit", (c) => {
    const spec = getSpec();
    const approvals = getApprovals();
    const violations: string[] = [];
    if (!spec) violations.push("no valid spec: fix parse/validation errors first");
    else if (spec.features.length === 0) violations.push("no features to commit");
    else
      for (const f of spec.features)
        if (!approvals[f.id]) violations.push(`feature ${f.id} not approved`);
    if (violations.length > 0) return c.json({ ok: false, violations }, 422);

    const s = spec as SpecificationT;
    const ann = getAnnotations();
    const merged: SpecificationT = {
      ...s,
      features: s.features.map((f) => {
        const map = ann[f.id];
        if (!map) return f;
        const notes: Record<string, string> = {};
        for (const [k, v] of Object.entries(map)) notes[k] = v.note;
        return { ...f, annotations: { ...f.annotations, ...notes } };
      }),
    };
    shieldWrite(opts.specPath, opts.projectRoot, writeBytes(canonicalJson(merged)));
    shieldWrite(opts.openuiPath, opts.projectRoot, writeBytes(serializeOpenui(merged, registry)));
    return c.json({ ok: true, written: [opts.specPath, opts.openuiPath] });
  });
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run apps/cli/test/author-annotate.test.ts`
Expected: PASS (4 tests).
Run: `npx vitest run apps/cli/test/author-app.test.ts apps/cli/test/author-commit.test.ts`
Expected: PASS (existing daemon tests still green; note `snapshot` now carries `annotations: {}`).
Run: `pnpm --filter @boyscout/cli typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/author/app.ts apps/cli/src/author/commit.ts apps/cli/test/author-annotate.test.ts
git commit -m "feat(sp5b): per-node annotation side-car, /api/annotate, commit merge"
```

---

### Task 5: Guided endpoints — `/api/questionnaire` + `/api/compose` (SSE) + `--questionnaire` flag (daemon)

**Files:**
- Create: `apps/cli/src/author/guided.ts`
- Modify: `apps/cli/src/author/app.ts` (add `questionnaire?` option; register guided routes; expose `reparse` as the seed)
- Modify: `apps/cli/src/author/command.ts` (`--questionnaire` flag + startup parse)
- Modify: `apps/cli/package.json` (add `@boyscout/questionnaire` dependency)
- Test: `apps/cli/test/author-guided.test.ts`

**Interfaces:**
- Consumes: `compose(q, answers, registry): ComposeResult`, `parseQuestionnaire(yaml): QuestionnaireT`, `QuestionnaireError` from `@boyscout/questionnaire`; `serializeOpenui` from `@boyscout/dialect`; `streamSSE` from `hono/streaming`; `QuestionnaireT`, `AnswersT` from `@boyscout/schemas`.
- Produces:
  - `registerGuided(app, registry, getQuestionnaire, seed)` — `GET /api/questionnaire`, `POST /api/compose` (SSE).
  - `AuthAppOptions.questionnaire?: QuestionnaireT`.

- [ ] **Step 1: Add the engine dependency to the CLI**

In `apps/cli/package.json` `"dependencies"`, add (alphabetical with the other `@boyscout/*`):

```json
    "@boyscout/questionnaire": "workspace:*",
```

Run `pnpm install`. Expected: lockfile updates.

- [ ] **Step 2: Write the failing test**

Create `apps/cli/test/author-guided.test.ts`:

```ts
import { registry } from "@boyscout/bridge-astryx-react";
import { parseQuestionnaire } from "@boyscout/questionnaire";
import { describe, expect, it } from "vitest";
import { createAuthApp } from "../src/author/app.js";

const TOKEN = "test-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const YAML = `bridge: astryx-react
platform: react
questions:
  - id: screen
    type: single
    prompt: Screen?
    options:
      - value: dashboard
        contributes:
          id: dash
          capability: component
          openui: 'Card { Grid(2) { Heading(3, "Overview") } }'
`;

function make() {
  return createAuthApp({
    registry, token: TOKEN, selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: "", specPath: "/tmp/x/spec.json", openuiPath: "/tmp/x/b.openui", projectRoot: "/tmp/x",
    questionnaire: parseQuestionnaire(YAML),
  });
}
const compose = (app: ReturnType<typeof make>["app"], answers: unknown) =>
  app.request("/api/compose", { method: "POST", headers: auth, body: JSON.stringify({ answers }) });

/** Collect SSE frames from a Response body into {event,data} pairs. */
async function frames(res: Response): Promise<{ event: string; data: string }[]> {
  const text = await res.text();
  return text.split("\n\n").filter((f) => f.includes("data:")).map((f) => {
    let event = "message";
    const data: string[] = [];
    for (const line of f.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    return { event, data: data.join("\n") };
  });
}

describe("guided endpoints", () => {
  it("serves the questionnaire", async () => {
    const { app } = make();
    const res = await app.request("/api/questionnaire", { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).questions[0].id).toBe("screen");
  });

  it("returns 404 when no questionnaire is configured", async () => {
    const app2 = createAuthApp({
      registry, token: TOKEN, selfOrigin: "http://127.0.0.1:4517",
      initialOpenui: "", specPath: "/tmp/x/s.json", openuiPath: "/tmp/x/b.openui", projectRoot: "/tmp/x",
    }).app;
    expect((await app2.request("/api/questionnaire", { headers: auth })).status).toBe(404);
  });

  it("streams feature then done for a valid answer set and seeds the editor", async () => {
    const { app } = make();
    const evs = await frames(await compose(app, { screen: "dashboard" }));
    expect(evs.map((e) => e.event)).toEqual(["feature", "done"]);
    expect(JSON.parse(evs[0]!.data).id).toBe("dash");
    const done = JSON.parse(evs[1]!.data);
    expect(done.openui).toContain("Overview");
    expect(done.spec.features).toHaveLength(1);
    // seeded into session state:
    const state = await (await app.request("/api/state", { headers: auth })).json();
    expect(state.ast.features[0].id).toBe("dash");
    expect(state.approvals).toEqual({ dash: false });
  });

  it("emits a single violations event for an incomplete answer set", async () => {
    const { app } = make();
    const evs = await frames(await compose(app, {}));
    expect(evs.map((e) => e.event)).toEqual(["violations"]);
    expect(JSON.parse(evs[0]!.data).violations[0]).toContain("required");
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run apps/cli/test/author-guided.test.ts`
Expected: FAIL — `/api/questionnaire` 404 even when configured (route not registered); `questionnaire` not an accepted option.

- [ ] **Step 4: Implement `guided.ts`**

Create `apps/cli/src/author/guided.ts`:

```ts
import { type DialectRegistry, serializeOpenui } from "@boyscout/dialect";
import { compose } from "@boyscout/questionnaire";
import type { AnswersT, QuestionnaireT } from "@boyscout/schemas";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Guided-authoring routes. `getQuestionnaire` returns the parsed questionnaire (or undefined
 * when none was configured); `seed` re-parses the composed .openui into session state (reusing
 * the daemon's reparse so approvals/annotations/errors stay consistent).
 */
export function registerGuided(
  app: Hono,
  registry: DialectRegistry,
  getQuestionnaire: () => QuestionnaireT | undefined,
  seed: (openui: string) => void,
): void {
  app.get("/api/questionnaire", (c) => {
    const q = getQuestionnaire();
    return q ? c.json(q) : c.json({ error: "no questionnaire" }, 404);
  });

  app.post("/api/compose", async (c) => {
    const q = getQuestionnaire();
    if (!q) return c.json({ error: "no questionnaire" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { answers?: AnswersT };
    const result = compose(q, body.answers ?? {}, registry);
    return streamSSE(c, async (stream) => {
      if (!result.ok) {
        await stream.writeSSE({ event: "violations", data: JSON.stringify({ violations: result.violations }) });
        return;
      }
      for (const f of result.spec.features) {
        await stream.writeSSE({ event: "feature", data: JSON.stringify(f) });
      }
      const openui = serializeOpenui(result.spec, registry);
      seed(openui);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ openui, spec: result.spec }) });
    });
  });
}
```

- [ ] **Step 5: Wire it into `app.ts`**

In `apps/cli/src/author/app.ts`:

(a) Add imports:

```ts
import type { QuestionnaireT } from "@boyscout/schemas";
import { registerGuided } from "./guided.js";
```

(b) Add the option to `AuthAppOptions`:

```ts
  /** When set, guided-authoring routes serve this questionnaire. */
  questionnaire?: QuestionnaireT;
```

(c) Register guided routes (right before `registerCommit(...)`):

```ts
  registerGuided(
    app,
    registry,
    () => opts.questionnaire,
    (text) => reparse(text),
  );
```

Note: `AstNodeT`, `SpecificationT`, `QuestionnaireT` all come from `@boyscout/schemas` — combine into one `import type { AstNodeT, QuestionnaireT, SpecificationT } from "@boyscout/schemas";` line.

- [ ] **Step 6: Wire `command.ts`**

In `apps/cli/src/author/command.ts`:

(a) Add imports at the top:

```ts
import { parseQuestionnaire, QuestionnaireError } from "@boyscout/questionnaire";
import type { QuestionnaireT } from "@boyscout/schemas";
```

(b) In `authorCommand`, after the `initialOpenui` line, parse the questionnaire flag (return 1 on error, mirroring the server `on("error")` exit path):

```ts
  const questionnairePath = flag(argv, "--questionnaire", "");
  let questionnaire: QuestionnaireT | undefined;
  if (questionnairePath) {
    try {
      questionnaire = parseQuestionnaire(readFileSync(resolve(questionnairePath), "utf8"));
    } catch (e) {
      const msg = e instanceof QuestionnaireError ? e.message : (e as Error).message;
      process.stderr.write(`boyscout author: ${msg}\n`);
      return 1;
    }
  }
```

(c) Pass it into `createAuthApp` — add to the options object, using a conditional spread (strict `exactOptionalPropertyTypes`):

```ts
  const { app } = createAuthApp({
    registry,
    token,
    selfOrigin,
    initialOpenui,
    specPath,
    openuiPath,
    projectRoot: process.cwd(),
    ...(questionnaire ? { questionnaire } : {}),
  });
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run apps/cli/test/author-guided.test.ts`
Expected: PASS (4 tests).
Run: `pnpm --filter @boyscout/cli typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/cli/src/author/guided.ts apps/cli/src/author/app.ts apps/cli/src/author/command.ts apps/cli/package.json pnpm-lock.yaml apps/cli/test/author-guided.test.ts
git commit -m "feat(sp5b): guided endpoints — /api/questionnaire + /api/compose SSE + --questionnaire flag"
```

---

### Task 6: SPA guided mode — client methods + App integration

**Files:**
- Modify: `apps/boyscout-ui/src/api.ts` (`AuthState.annotations`; `questionnaire`, `composeStream`, `annotate` methods)
- Modify: `apps/boyscout-ui/src/App.tsx` (guided form pane, debounced compose, streaming preview, annotation outline, violations)
- Test: `apps/boyscout-ui/test/api.test.ts` (extend for the new client methods)

**Interfaces:**
- Consumes: `postSse` from `./sse.js`; `questionnaireToTree`, `toggleAnswer`, `flattenPaths` from `./questionnaire-tree.js`; `formComponents`, `AnswerContext` from `./form-components.js`; `QuestionnaireT`, `AnswersT`, `FeatureT` from `@boyscout/schemas`.
- Produces (client): `questionnaire(): Promise<QuestionnaireT | null>`, `composeStream(answers, onEvent): Promise<void>`, `annotate(featureId, path, note): Promise<{ annotations: Record<string, string> }>`.

- [ ] **Step 1: Write the failing test (client methods)**

Append to `apps/boyscout-ui/test/api.test.ts` a new suite:

```ts
import { makeClient as makeClient2 } from "../src/api.js";

describe("api client — guided", () => {
  it("annotate posts featureId/path/note", async () => {
    const calls: { url: string; body: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ annotations: { "0": "n" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = makeClient2("tok", fakeFetch);
    const r = await client.annotate("card", "0", "n");
    expect(r.annotations).toEqual({ "0": "n" });
    expect(calls[0]?.url).toContain("/api/annotate");
    expect(JSON.parse(calls[0]!.body)).toEqual({ featureId: "card", path: "0", note: "n" });
  });

  it("questionnaire returns null on a 404", async () => {
    const fakeFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await makeClient2("tok", fakeFetch).questionnaire()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run apps/boyscout-ui/test/api.test.ts`
Expected: FAIL — `annotate`/`questionnaire` not on the client.

- [ ] **Step 3: Implement `api.ts`**

In `apps/boyscout-ui/src/api.ts`:

(a) Add imports and extend `AuthState`:

```ts
import type { AnswersT, QuestionnaireT, SpecificationT } from "@boyscout/schemas";
import { postSse, type SseEvent } from "./sse.js";

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
  annotations: Record<string, Record<string, string>>;
}
```

(b) Add the three methods inside the returned client object (after `commit`):

```ts
    questionnaire: async (): Promise<QuestionnaireT | null> => {
      const res = await fetchImpl("/api/questionnaire", { headers });
      return res.ok ? ((await res.json()) as QuestionnaireT) : null;
    },
    composeStream: (answers: AnswersT, onEvent: (e: SseEvent) => void): Promise<void> =>
      postSse("/api/compose", { answers }, headers, onEvent, fetchImpl),
    annotate: (featureId: string, path: string, note: string) =>
      post("/api/annotate", { featureId, path, note }) as Promise<{
        annotations: Record<string, string>;
      }>,
```

- [ ] **Step 4: Implement `App.tsx` guided mode**

Replace `apps/boyscout-ui/src/App.tsx` with:

```tsx
import type { AnswersT, FeatureT, QuestionnaireT } from "@boyscout/schemas";
import { Renderer } from "@boyscout/renderer";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { makeClient } from "./api.js";
import { astryxMap } from "./astryx-map.js";
import { AnswerContext, formComponents } from "./form-components.js";
import { flattenPaths, questionnaireToTree, toggleAnswer } from "./questionnaire-tree.js";

type Client = ReturnType<typeof makeClient>;

export function App({ client }: { client: Client }): ReactElement {
  const [text, setText] = useState("");
  const [features, setFeatures] = useState<FeatureT[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState("");
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireT | null>(null);
  const [answers, setAnswers] = useState<AnswersT>({});
  const [violations, setViolations] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Record<string, string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void client.state().then((s) => {
      setText(s.openui);
      setFeatures(s.ast?.features ?? []);
      setApprovals(s.approvals);
      setErrors(s.errors);
      setAnnotations(s.annotations);
    });
    void client.questionnaire().then(setQuestionnaire);
  }, [client]);

  // Guided mode: debounce-compose whenever answers change; stream features into the preview.
  useEffect(() => {
    if (!questionnaire) return;
    if (composeTimer.current) clearTimeout(composeTimer.current);
    composeTimer.current = setTimeout(() => {
      const streamed: FeatureT[] = [];
      setViolations([]);
      void client.composeStream(answers, (e) => {
        if (e.event === "feature") {
          streamed.push(JSON.parse(e.data) as FeatureT);
          setFeatures([...streamed]);
        } else if (e.event === "violations") {
          setViolations((JSON.parse(e.data) as { violations: string[] }).violations);
        } else if (e.event === "done") {
          const d = JSON.parse(e.data) as { openui: string; spec: { features: FeatureT[] } };
          setText(d.openui);
          setFeatures(d.spec.features);
          void client.state().then((s) => {
            setApprovals(s.approvals);
            setAnnotations(s.annotations);
            setErrors(s.errors);
          });
        }
      });
    }, 250);
  }, [answers, questionnaire, client]);

  const onEdit = (next: string): void => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void client.parse(next).then((r) => {
        setErrors(r.errors);
        if (r.ok && r.ast) setFeatures(r.ast.features);
      });
      void client.state().then((s) => {
        setApprovals(s.approvals);
        setAnnotations(s.annotations);
      });
    }, 250);
  };

  const onAnswer = (qid: string, value: string, kind: string): void =>
    setAnswers((a) => toggleAnswer(a, qid, value, kind));

  const toggle = (id: string, approved: boolean): void => {
    void client.approve(id, approved).then((r) => setApprovals(r.approvals));
  };

  const setNote = (featureId: string, pathKey: string, note: string): void => {
    setAnnotations((prev) => ({ ...prev, [featureId]: { ...(prev[featureId] ?? {}), [pathKey]: note } }));
    void client.annotate(featureId, pathKey, note).then((r) =>
      setAnnotations((prev) => ({ ...prev, [featureId]: r.annotations })),
    );
  };

  const commit = (): void => {
    void client.commit().then((r) => {
      setMessage(
        r.ok ? `Wrote: ${r.written?.join(", ")}` : `Cannot write: ${r.violations?.join("; ")}`,
      );
    });
  };

  const allApproved = features.length > 0 && features.every((f) => approvals[f.id]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100vh", padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
        {questionnaire && (
          <AnswerContext.Provider value={{ answers, onAnswer }}>
            <Renderer ast={questionnaireToTree(questionnaire, answers)} components={formComponents} />
          </AnswerContext.Provider>
        )}
        {violations.length > 0 && (
          <ul data-testid="violations" style={{ color: "crimson", fontFamily: "monospace" }}>
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        )}
        <textarea
          data-testid="editor"
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          style={{ flex: 1, minHeight: 120, fontFamily: "monospace", fontSize: 13 }}
        />
        {errors.length > 0 && (
          <ul data-testid="errors" style={{ color: "crimson", fontFamily: "monospace" }}>
            {errors.map((e) => (
              <li key={`${e.line}:${e.message}`}>
                line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        )}
        <div>
          {features.map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                data-testid={`approve-${f.id}`}
                checked={!!approvals[f.id]}
                onChange={(e) => toggle(f.id, e.target.checked)}
              />
              {f.capability} {f.id}
            </label>
          ))}
          <button type="button" data-testid="commit" disabled={!allApproved} onClick={commit}>
            Write spec
          </button>
          <span data-testid="message">{message}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div data-testid="preview" style={{ flex: 1, overflow: "auto", border: "1px solid #ddd" }}>
          {features.map((f) => (
            <div key={f.id}>
              <Renderer ast={f.tree} components={astryxMap} />
            </div>
          ))}
        </div>
        <div data-testid="annotations">
          {features.map((f) => (
            <div key={f.id}>
              <strong>{f.id}</strong>
              {flattenPaths(f.tree).map(({ pathKey, type }) => (
                <label key={pathKey || "root"} style={{ display: "block", fontSize: 12 }}>
                  {pathKey || "root"} · {type}
                  <input
                    data-testid={`annotate-${f.id}-${pathKey}`}
                    value={annotations[f.id]?.[pathKey] ?? ""}
                    onChange={(e) => setNote(f.id, pathKey, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run apps/boyscout-ui/test/api.test.ts`
Expected: PASS.
Run: `pnpm --filter boyscout-ui typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/boyscout-ui/src/api.ts apps/boyscout-ui/src/App.tsx apps/boyscout-ui/test/api.test.ts
git commit -m "feat(sp5b): SPA guided mode — questionnaire form, streaming compose, annotation outline"
```

---

### Task 7: Guided-flow Playwright E2E

**Files:**
- Create: `apps/boyscout-ui/e2e/fixtures/sample.questionnaire.yaml`
- Create: `apps/boyscout-ui/e2e/guided.spec.ts`

**Interfaces:**
- Consumes: the daemon `author --questionnaire` flag (Task 5), the guided SPA (Task 6), the annotation commit merge (Task 4). Mirrors the existing `apps/boyscout-ui/e2e/authoring.spec.ts` harness (fixed `BOYSCOUT_AUTH_TOKEN`, tsx loader, tmp project dir).

- [ ] **Step 1: Create the questionnaire fixture**

Create `apps/boyscout-ui/e2e/fixtures/sample.questionnaire.yaml`:

```yaml
bridge: astryx-react
platform: react
questions:
  - id: screen
    type: single
    prompt: Screen type?
    options:
      - value: login
        contributes:
          id: login-card
          capability: component
          openui: 'Card { Heading(3, "Sign in") }'
      - value: dashboard
        contributes:
          id: dashboard-grid
          capability: component
          openui: 'Card { Grid(2) { Heading(3, "Overview") } }'
  - id: sections
    type: multi
    prompt: Which sections?
    enabledWhen: { screen: [dashboard] }
    options:
      - value: header
        contributes:
          id: header-bar
          capability: component
          openui: 'Card { Heading(2, "Header") }'
```

- [ ] **Step 2: Write the E2E**

Create `apps/boyscout-ui/e2e/guided.spec.ts`:

```ts
import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const uiDist = resolve(here, "../dist");
const cliBin = resolve(repoRoot, "apps/cli/src/bin.ts");
const PORT = 4601;
const TOKEN = "e2e-guided-token";
const tsxLoader = pathToFileURL(resolve(repoRoot, "apps/cli/node_modules/tsx/dist/loader.mjs")).href;

let daemon: ChildProcess;
let projectDir: string;

test.beforeAll(async () => {
  expect(existsSync(uiDist), "run `pnpm --filter boyscout-ui build` first").toBeTruthy();
  projectDir = mkdtempSync(join(tmpdir(), "bs-guided-"));
  copyFileSync(join(here, "fixtures/sample.questionnaire.yaml"), join(projectDir, "q.yaml"));

  daemon = spawn(
    "node",
    ["--import", tsxLoader, cliBin, "author",
      "--openui", "./boyscout.openui",
      "--spec", "./boyscout-spec.json",
      "--questionnaire", "./q.yaml",
      "--port", String(PORT), "--ui-dist", uiDist],
    { cwd: projectDir, env: { ...process.env, BOYSCOUT_AUTH_TOKEN: TOKEN }, stdio: "inherit" },
  );
  await expect
    .poll(async () => {
      try { return (await fetch(`http://127.0.0.1:${PORT}/`)).status; } catch { return 0; }
    }, { timeout: 20_000 })
    .toBe(200);
});

test.afterAll(() => {
  daemon?.kill();
});

test("questionnaire -> cascade -> stream -> annotate -> approve -> commit", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/#t=${TOKEN}`);
  await expect(page.getByTestId("questionnaire-form")).toBeVisible();

  // answer the gating question -> the dependent question appears (enabledWhen cascade)
  await page.getByTestId("opt-screen-dashboard").click();
  await expect(page.getByTestId("opt-sections-header")).toBeVisible();
  // composed feature streamed to the preview
  await expect(page.getByTestId("preview")).toContainText("Overview");

  // add the header section -> its feature streams in too
  await page.getByTestId("opt-sections-header").click();
  await expect(page.getByTestId("preview")).toContainText("Header");

  // annotate the dashboard-grid feature root (pathKey "")
  await page.getByTestId("annotate-dashboard-grid-").fill("primary grid");

  // approve both composed features and commit
  await page.getByTestId("approve-dashboard-grid").click();
  await expect(page.getByTestId("approve-dashboard-grid")).toBeChecked();
  await page.getByTestId("approve-header-bar").click();
  await expect(page.getByTestId("approve-header-bar")).toBeChecked();
  await page.getByTestId("commit").click();
  await expect(page.getByTestId("message")).toContainText("Wrote:");

  // spec.json on disk carries both features and the annotation
  const spec = JSON.parse(readFileSync(join(projectDir, "boyscout-spec.json"), "utf8"));
  const ids = spec.features.map((f: { id: string }) => f.id).sort();
  expect(ids).toEqual(["dashboard-grid", "header-bar"]);
  const dash = spec.features.find((f: { id: string }) => f.id === "dashboard-grid");
  expect(dash.annotations[""]).toBe("primary grid");
});

test("an incomplete answer set shows violations and does not seed", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/#t=${TOKEN}`);
  await expect(page.getByTestId("questionnaire-form")).toBeVisible();
  // no answer to the required single question -> violations, no features in preview
  await expect(page.getByTestId("violations")).toContainText("required");
});
```

- [ ] **Step 3: Build the SPA and run the E2E**

Run: `pnpm --filter boyscout-ui build`
Expected: `apps/boyscout-ui/dist` produced.
Run: `pnpm --filter boyscout-ui e2e`
Expected: both tests PASS.

(If the second test is flaky because the first test's composed state persisted in the shared daemon session, it still holds: the second `goto` re-answers nothing, so `compose({})` re-runs and emits `violations`. The daemon session is per-process, and `compose({})` always yields the required-violation regardless of prior state.)

- [ ] **Step 4: Commit**

```bash
git add apps/boyscout-ui/e2e/fixtures/sample.questionnaire.yaml apps/boyscout-ui/e2e/guided.spec.ts
git commit -m "test(sp5b): guided-flow E2E — questionnaire cascade -> stream -> annotate -> commit"
```

---

## Self-Review

**Spec coverage:**
- Questionnaire UI (Astryx-rendered form) → Tasks 1, 2, 6. ✅
- SSE per-compose stream (`feature`*/`done`/`violations`) → Tasks 3 (client), 5 (server), 6 (wiring). ✅
- Per-node annotations (address, side-car persistence by subtree hash, commit merge) → Task 4; UI outline → Task 6. ✅
- `--questionnaire` flag + startup parse + exit 1 → Task 5. ✅
- Reuses existing `<Renderer/>` with a UI-side map, no bridge/registry change → Task 2. ✅
- `.openui` DSL / SP4a round-trip untouched (annotations spec-JSON side-car only) → Task 4 stores notes in `feature.annotations`, `serializeOpenui` still runs over the tree. ✅
- Error contract (malformed → exit 1; violations event; annotate unknown ignored; empty questionnaire 404) → Tasks 5, 4. ✅
- Testing (unit `questionnaireToTree`/annotation side-car/compose SSE handler; guided E2E) → Tasks 1, 4, 5, 7. ✅

**Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". Every code step carries complete code. ✅

**Type consistency:**
- Annotation session type `Record<string, Record<string, { note: string; sig: string }>>` — consistent across `app.ts` (Task 4), `commit.ts` `getAnnotations` (Task 4), used identically.
- Snapshot/`AuthState.annotations` (notes only) `Record<string, Record<string, string>>` — consistent in `app.ts` and `api.ts` (Tasks 4, 6).
- `pathKey` convention (`""` = root, dot-joined indices) — identical in `nodeAtPath`/`flattenPaths`/annotation keys and the E2E (`annotate-dashboard-grid-`).
- SSE events `feature`/`done`/`violations` with `{ openui, spec }` / `{ violations }` — consistent between `guided.ts` (Task 5), `sse.ts` consumer (Task 3), and `App.tsx` (Task 6).
- `registerGuided(app, registry, getQuestionnaire, seed)` and `registerCommit(app, opts, getSpec, getApprovals, getAnnotations, registry)` signatures match their call sites in `app.ts`. ✅
- `toggleAnswer`/`questionnaireToTree`/`flattenPaths` names identical across Tasks 1 and 6. ✅
