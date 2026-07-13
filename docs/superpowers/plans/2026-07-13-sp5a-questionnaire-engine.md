# SP5a — `@boyscout/questionnaire` Deterministic Composition Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new headless core package, `@boyscout/questionnaire`, whose `compose()` turns a closed YAML questionnaire + closed answers into a validated `Specification`, deterministically (same answers → same spec bytes).

**Architecture:** `compose()` assembles a `.openui` document from the fragments of enabled+answered options, then runs SP4a's proven `parseOpenui` (bind + `validateSpec` 422 gate) — so the composed spec is byte-stable and round-trippable *by construction*. The package adds no new parser, validator, or determinism primitive. `enabledWhen` is evaluated as a pure forward pass; assembly is declaration order.

**Tech Stack:** TypeScript (strict), Zod 4, `yaml@2.9.0` (already a monorepo dep), Vitest. Reuses `@boyscout/dialect` (`parseOpenui`, `serializeOpenui`, `DialectRegistry`) and `@boyscout/schemas`.

## Global Constraints

- **Closed, no free inference.** Answers are closed selections only (`string` for `single`, `string[]` for `multi`); no arbitrary text, no placeholder substitution.
- **Determinism.** Composition order is questionnaire declaration order (question order, then option order). All serialize/sort/write flows through `@boyscout/determinism` *via* `parseOpenui`/`serializeOpenui` — the engine introduces no ordering, timestamp, or randomness of its own.
- **API shapes (locked in brainstorming).** `compose()` returns a **Result** `{ ok: true; spec } | { ok: false; violations: string[] }` (multi-violation, like the 422 gate). `parseQuestionnaire()` **throws** `QuestionnaireError` (a malformed file is one fatal error, mirroring SP4a's `DialectError`).
- **bridge/platform live in the questionnaire header.** The caller passes the **matching** `DialectRegistry`; a mismatch surfaces as a normal parse/gate violation. Spec `version` is fixed at `1`.
- **No new runtime dependency.** Use `yaml@2.9.0` (`import { parse } from "yaml"`), already used by `@boyscout/runtime`.
- **`enabledWhen`** is a closed predicate map `{ questionId: value | [values] }`: AND across keys, any-of within a list value; single answers match by equality, multi answers by "includes"; forward-references only (may reference only earlier questions).
- **TS strict.** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` are on: use `import type` for types, `.js` extensions on relative imports, and conditionally-spread optional props (`...(x ? { x } : {})`).
- **Tests** live in `packages/<pkg>/test/**/*.test.ts` (vitest `include` glob). Run one file with `npx vitest run <path>`. Typecheck with `pnpm --filter @boyscout/questionnaire typecheck`.
- **Local lint quirk:** `biome lint` OOMs in this sandbox. The local gates are `npx vitest run`, `pnpm --filter … typecheck`, and `pnpm format:check`; **`biome lint` is CI-authoritative** — do not block on running it locally.

---

### Task 1: Questionnaire schemas in `@boyscout/schemas`

**Files:**
- Modify: `packages/schemas/src/index.ts` (append after the `Specification` block, ~line 36)
- Test: `packages/schemas/test/questionnaire.test.ts`

**Interfaces:**
- Consumes: nothing (leaf schema task); the file already imports `z` from `zod`.
- Produces: Zod schemas `Contribution`, `QuestionOption`, `Question`, `Questionnaire` and inferred types `ContributionT`, `QuestionOptionT`, `QuestionT`, `QuestionnaireT`, plus the `AnswersT` type alias. Later tasks import these from `@boyscout/schemas`.

- [ ] **Step 1: Write the failing test**

Create `packages/schemas/test/questionnaire.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Questionnaire } from "../src/index.js";

const sample = {
  bridge: "astryx-react",
  platform: "react",
  questions: [
    {
      id: "screen",
      type: "single",
      prompt: "Screen?",
      options: [
        {
          value: "login",
          contributes: { id: "login-card", capability: "component", openui: "Card {}" },
        },
      ],
    },
  ],
};

describe("Questionnaire schema", () => {
  it("accepts a well-formed questionnaire", () => {
    // biome-ignore lint/style/noNonNullAssertion: sample has exactly one question
    expect(Questionnaire.parse(sample).questions[0]!.type).toBe("single");
  });

  it("rejects an unknown question type", () => {
    const bad = structuredClone(sample);
    // @ts-expect-error intentional malformation
    bad.questions[0].type = "dropdown";
    expect(Questionnaire.safeParse(bad).success).toBe(false);
  });

  it("rejects a question missing its options", () => {
    const bad = structuredClone(sample);
    // @ts-expect-error intentional malformation
    delete bad.questions[0].options;
    expect(Questionnaire.safeParse(bad).success).toBe(false);
  });

  it("accepts an optional enabledWhen with string or list values", () => {
    const withCond = structuredClone(sample);
    withCond.questions.push({
      id: "extra",
      type: "multi",
      prompt: "?",
      enabledWhen: { screen: ["login"] },
      options: [
        { value: "x", contributes: { id: "x", capability: "component", openui: "Card {}" } },
      ],
    } as never);
    expect(Questionnaire.safeParse(withCond).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/schemas/test/questionnaire.test.ts`
Expected: FAIL — `Questionnaire` is not exported from `../src/index.js`.

- [ ] **Step 3: Add the schemas**

In `packages/schemas/src/index.ts`, append after the `SpecificationT` export (after line 36):

```ts
// ---- Questionnaire (SP5a): closed, deterministic composition source (D9) ----

/** One authored fragment: a .openui tree BODY (single root node) + the feature it becomes. */
export const Contribution = z.object({
  id: z.string(),
  capability: z.string(),
  openui: z.string(),
});
export type ContributionT = z.infer<typeof Contribution>;

export const QuestionOption = z.object({
  value: z.string(),
  contributes: Contribution,
});
export type QuestionOptionT = z.infer<typeof QuestionOption>;

export const Question = z.object({
  id: z.string(),
  type: z.enum(["single", "multi"]),
  prompt: z.string(),
  options: z.array(QuestionOption),
  /** closed predicate: { earlierQuestionId: value | [values] }; AND across keys, any-of within a list. */
  enabledWhen: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});
export type QuestionT = z.infer<typeof Question>;

export const Questionnaire = z.object({
  bridge: z.string(),
  platform: z.string(),
  questions: z.array(Question),
});
export type QuestionnaireT = z.infer<typeof Questionnaire>;

/** Closed answers: questionId -> chosen option value(s). single => string, multi => string[]. */
export type AnswersT = Record<string, string | string[]>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/schemas/test/questionnaire.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @boyscout/schemas typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/index.ts packages/schemas/test/questionnaire.test.ts
git commit -m "feat(schemas): Questionnaire/Question/Option/Contribution + AnswersT (SP5a)"
```

---

### Task 2: Package scaffold + `parseQuestionnaire`

**Files:**
- Create: `packages/questionnaire/package.json`
- Create: `packages/questionnaire/tsconfig.json`
- Create: `packages/questionnaire/src/index.ts`
- Test: `packages/questionnaire/test/parse.test.ts`

**Interfaces:**
- Consumes: `Questionnaire`, `QuestionnaireT`, `QuestionT` from `@boyscout/schemas` (Task 1); `parse` from `yaml`.
- Produces: `class QuestionnaireError extends Error`; `function parseQuestionnaire(yaml: string): QuestionnaireT`. Later tasks add `enabledQuestions`, `assembleDoc`, and `compose` to this package.

- [ ] **Step 1: Create `packages/questionnaire/package.json`**

```json
{
  "name": "@boyscout/questionnaire",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@boyscout/dialect": "workspace:*",
    "@boyscout/schemas": "workspace:*",
    "yaml": "2.9.0"
  }
}
```

- [ ] **Step 2: Create `packages/questionnaire/tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }
```

- [ ] **Step 3: Link the new workspace package**

Run: `pnpm install`
Expected: lockfile updates; `@boyscout/questionnaire` resolves `@boyscout/dialect`, `@boyscout/schemas`, `yaml`.

- [ ] **Step 4: Write the failing test**

Create `packages/questionnaire/test/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { QuestionnaireError, parseQuestionnaire } from "../src/index.js";

const VALID = `bridge: astryx-react
platform: react
questions:
  - id: screen
    type: single
    prompt: Screen?
    options:
      - value: login
        contributes: { id: login-card, capability: component, openui: "Card {}" }
  - id: extras
    type: multi
    prompt: Extras?
    enabledWhen: { screen: login }
    options:
      - value: banner
        contributes: { id: banner, capability: component, openui: "Card {}" }
`;

describe("parseQuestionnaire", () => {
  it("parses a well-formed questionnaire", () => {
    const q = parseQuestionnaire(VALID);
    expect(q.questions.map((x) => x.id)).toEqual(["screen", "extras"]);
  });

  it("throws QuestionnaireError on malformed YAML", () => {
    expect(() => parseQuestionnaire("bridge: [unclosed")).toThrow(QuestionnaireError);
  });

  it("throws when the shape fails schema validation", () => {
    expect(() => parseQuestionnaire("bridge: x\nplatform: y\nquestions: 5\n")).toThrow(
      QuestionnaireError,
    );
  });

  it("rejects an enabledWhen that references a later question (forward-only)", () => {
    const fwd = `bridge: x
platform: y
questions:
  - id: a
    type: single
    prompt: A
    enabledWhen: { b: v }
    options:
      - value: v
        contributes: { id: av, capability: component, openui: "Card {}" }
  - id: b
    type: single
    prompt: B
    options:
      - value: v
        contributes: { id: bv, capability: component, openui: "Card {}" }
`;
    expect(() => parseQuestionnaire(fwd)).toThrow(/not an earlier question/);
  });

  it("rejects an enabledWhen value absent from the referenced question's options", () => {
    const bad = `bridge: x
platform: y
questions:
  - id: a
    type: single
    prompt: A
    options:
      - value: v
        contributes: { id: av, capability: component, openui: "Card {}" }
  - id: b
    type: single
    prompt: B
    enabledWhen: { a: nope }
    options:
      - value: w
        contributes: { id: bw, capability: component, openui: "Card {}" }
`;
    expect(() => parseQuestionnaire(bad)).toThrow(/not in options of "a"/);
  });

  it("rejects duplicate question ids", () => {
    const dup = VALID.replace("id: extras", "id: screen");
    expect(() => parseQuestionnaire(dup)).toThrow(/duplicate question id/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run packages/questionnaire/test/parse.test.ts`
Expected: FAIL — `../src/index.js` does not exist.

- [ ] **Step 6: Implement `parseQuestionnaire`**

Create `packages/questionnaire/src/index.ts`:

```ts
import { Questionnaire, type QuestionT, type QuestionnaireT } from "@boyscout/schemas";
import { parse as parseYaml } from "yaml";

export class QuestionnaireError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionnaireError";
  }
}

/**
 * Parse + validate a questionnaire YAML. Beyond Zod shape validation, enforces the
 * two structural rules: `enabledWhen` may reference only EARLIER questions, and every
 * referenced question id + value must exist in that question's option set. Throws
 * QuestionnaireError on any violation — a malformed file is one fatal authoring error.
 */
export function parseQuestionnaire(yaml: string): QuestionnaireT {
  let raw: unknown;
  try {
    raw = parseYaml(yaml);
  } catch (e) {
    throw new QuestionnaireError(`invalid YAML: ${(e as Error).message}`);
  }
  const parsed = Questionnaire.safeParse(raw);
  if (!parsed.success) {
    throw new QuestionnaireError(`invalid questionnaire: ${parsed.error.message}`);
  }
  const q = parsed.data;

  const seen = new Map<string, QuestionT>(); // earlier questions, keyed by id
  for (const question of q.questions) {
    if (seen.has(question.id)) {
      throw new QuestionnaireError(`duplicate question id "${question.id}"`);
    }
    if (question.enabledWhen) {
      for (const [refId, expected] of Object.entries(question.enabledWhen)) {
        const ref = seen.get(refId);
        if (!ref) {
          throw new QuestionnaireError(
            `question "${question.id}" enabledWhen references "${refId}", which is not an earlier question`,
          );
        }
        const wanted = Array.isArray(expected) ? expected : [expected];
        const optionValues = new Set(ref.options.map((o) => o.value));
        for (const v of wanted) {
          if (!optionValues.has(v)) {
            throw new QuestionnaireError(
              `enabledWhen on "${question.id}" references value "${v}" not in options of "${refId}"`,
            );
          }
        }
      }
    }
    seen.set(question.id, question);
  }
  return q;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run packages/questionnaire/test/parse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @boyscout/questionnaire typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/questionnaire/package.json packages/questionnaire/tsconfig.json packages/questionnaire/src/index.ts packages/questionnaire/test/parse.test.ts pnpm-lock.yaml
git commit -m "feat(questionnaire): package scaffold + parseQuestionnaire with structural checks (SP5a)"
```

---

### Task 3: `enabledWhen` evaluation (`enabled.ts`)

**Files:**
- Create: `packages/questionnaire/src/enabled.ts`
- Test: `packages/questionnaire/test/enabled.test.ts`

**Interfaces:**
- Consumes: `AnswersT`, `QuestionT`, `QuestionnaireT` from `@boyscout/schemas`.
- Produces: `function enabledQuestions(q: QuestionnaireT, answers: AnswersT): QuestionT[]` — the forward-pass enablement result, in declaration order. `compose` (Task 5) and SP5b's UI consume it.

- [ ] **Step 1: Write the failing test**

Create `packages/questionnaire/test/enabled.test.ts`:

```ts
import type { QuestionT, QuestionnaireT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { enabledQuestions } from "../src/enabled.js";

const opt = (value: string) => ({
  value,
  contributes: { id: `${value}-f`, capability: "component", openui: "Card {}" },
});
const q = (
  id: string,
  type: "single" | "multi",
  values: string[],
  enabledWhen?: QuestionT["enabledWhen"],
): QuestionT => ({
  id,
  type,
  prompt: id,
  options: values.map(opt),
  ...(enabledWhen ? { enabledWhen } : {}),
});
const make = (...questions: QuestionT[]): QuestionnaireT => ({
  bridge: "astryx-react",
  platform: "react",
  questions,
});
const ids = (qs: QuestionT[]): string[] => qs.map((x) => x.id);

describe("enabledQuestions", () => {
  it("includes a question with no enabledWhen unconditionally", () => {
    expect(ids(enabledQuestions(make(q("a", "single", ["x", "y"])), {}))).toEqual(["a"]);
  });

  it("single equality gates a dependent", () => {
    const survey = make(q("a", "single", ["x", "y"]), q("b", "single", ["p"], { a: "x" }));
    expect(ids(enabledQuestions(survey, { a: "x" }))).toEqual(["a", "b"]);
    expect(ids(enabledQuestions(survey, { a: "y" }))).toEqual(["a"]);
  });

  it("any-of (list value) matches a single answer in the set", () => {
    const survey = make(
      q("a", "single", ["x", "y", "z"]),
      q("b", "single", ["p"], { a: ["x", "z"] }),
    );
    expect(ids(enabledQuestions(survey, { a: "z" }))).toEqual(["a", "b"]);
    expect(ids(enabledQuestions(survey, { a: "y" }))).toEqual(["a"]);
  });

  it("multi answer matches by includes", () => {
    const survey = make(q("a", "multi", ["x", "y"]), q("b", "single", ["p"], { a: "x" }));
    expect(ids(enabledQuestions(survey, { a: ["x", "y"] }))).toEqual(["a", "b"]);
    expect(ids(enabledQuestions(survey, { a: ["y"] }))).toEqual(["a"]);
  });

  it("ANDs multiple clause keys", () => {
    const survey = make(
      q("a", "single", ["x"]),
      q("b", "single", ["m", "n"]),
      q("c", "single", ["p"], { a: "x", b: "m" }),
    );
    expect(ids(enabledQuestions(survey, { a: "x", b: "m" }))).toEqual(["a", "b", "c"]);
    expect(ids(enabledQuestions(survey, { a: "x", b: "n" }))).toEqual(["a", "b"]);
  });

  it("cascades: an upstream-disabled question disables its dependents", () => {
    const survey = make(
      q("a", "single", ["x", "y"]),
      q("b", "single", ["m"], { a: "x" }), // disabled when a=y
      q("c", "single", ["p"], { b: "m" }), // depends on b
    );
    // a=y disables b; even though b is answered, c must stay disabled
    expect(ids(enabledQuestions(survey, { a: "y", b: "m" }))).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/questionnaire/test/enabled.test.ts`
Expected: FAIL — `../src/enabled.js` does not exist.

- [ ] **Step 3: Implement `enabled.ts`**

Create `packages/questionnaire/src/enabled.ts`:

```ts
import type { AnswersT, QuestionT, QuestionnaireT } from "@boyscout/schemas";

/** Does an earlier question's answer satisfy one enabledWhen clause value? */
function clauseMatches(
  answer: string | string[] | undefined,
  expected: string | string[],
): boolean {
  if (answer === undefined) return false;
  const wanted = Array.isArray(expected) ? expected : [expected];
  if (Array.isArray(answer)) return answer.some((a) => wanted.includes(a));
  return wanted.includes(answer);
}

/**
 * The enabled questions, in declaration order. A question is enabled iff it has no
 * `enabledWhen`, or every clause key matches the answer of its referenced question —
 * and only answers of already-enabled questions count, so an upstream disabled
 * question cascades to disable its dependents. Single forward pass; cycles are
 * unrepresentable because `enabledWhen` may reference only earlier questions.
 */
export function enabledQuestions(q: QuestionnaireT, answers: AnswersT): QuestionT[] {
  const enabled: QuestionT[] = [];
  const enabledIds = new Set<string>();
  const answerOf = (id: string): string | string[] | undefined =>
    enabledIds.has(id) ? answers[id] : undefined;

  for (const question of q.questions) {
    const clauses = question.enabledWhen;
    const on =
      clauses === undefined ||
      Object.entries(clauses).every(([refId, expected]) =>
        clauseMatches(answerOf(refId), expected),
      );
    if (on) {
      enabled.push(question);
      enabledIds.add(question.id);
    }
  }
  return enabled;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/questionnaire/test/enabled.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @boyscout/questionnaire typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/questionnaire/src/enabled.ts packages/questionnaire/test/enabled.test.ts
git commit -m "feat(questionnaire): enabledWhen forward-pass evaluation (SP5a)"
```

---

### Task 4: Fragment assembly (`assemble.ts`)

**Files:**
- Create: `packages/questionnaire/src/assemble.ts`
- Test: `packages/questionnaire/test/assemble.test.ts`

**Interfaces:**
- Consumes: `ContributionT` from `@boyscout/schemas`.
- Produces: `function assembleDoc(bridge: string, platform: string, contributions: readonly ContributionT[]): string` — a full `.openui` document string (version fixed at `1`). `compose` (Task 5) consumes it.

- [ ] **Step 1: Write the failing test**

Create `packages/questionnaire/test/assemble.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleDoc } from "../src/assemble.js";

describe("assembleDoc", () => {
  it("emits header + one block per contribution in order (version fixed at 1)", () => {
    const doc = assembleDoc("astryx-react", "react", [
      { id: "a", capability: "component", openui: 'Card { Heading(2, "A") }' },
      { id: "b", capability: "service", openui: 'Service("S") {}' },
    ]);
    expect(doc).toBe(
      "spec version=1 bridge=astryx-react platform=react\n\n" +
        'component a =\nCard { Heading(2, "A") }\n\n' +
        'service b =\nService("S") {}\n',
    );
  });

  it("trims fragment whitespace so block-scalar YAML fragments assemble cleanly", () => {
    const doc = assembleDoc("astryx-react", "react", [
      { id: "a", capability: "component", openui: "\n  Card {}\n" },
    ]);
    expect(doc).toBe(
      "spec version=1 bridge=astryx-react platform=react\n\ncomponent a =\nCard {}\n",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/questionnaire/test/assemble.test.ts`
Expected: FAIL — `../src/assemble.js` does not exist.

- [ ] **Step 3: Implement `assemble.ts`**

Create `packages/questionnaire/src/assemble.ts`:

```ts
import type { ContributionT } from "@boyscout/schemas";

/**
 * Assemble selected fragments into a full .openui document (spec version fixed at 1).
 * Deterministic: header + one "<capability> <id> =\n<tree-body>" block per contribution,
 * in the given order. The downstream parser is whitespace-tolerant, so fragments need not
 * be canonically formatted — parse+serialize normalizes them. Each fragment must be a
 * single root node; a multi-root fragment fails loudly at parse time (surfaced by compose).
 */
export function assembleDoc(
  bridge: string,
  platform: string,
  contributions: readonly ContributionT[],
): string {
  const header = `spec version=1 bridge=${bridge} platform=${platform}`;
  const blocks = contributions.map((c) => `${c.capability} ${c.id} =\n${c.openui.trim()}`);
  return `${header}\n\n${blocks.join("\n\n")}\n`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/questionnaire/test/assemble.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @boyscout/questionnaire typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/questionnaire/src/assemble.ts packages/questionnaire/test/assemble.test.ts
git commit -m "feat(questionnaire): .openui document assembly from fragments (SP5a)"
```

---

### Task 5: `compose()` — orchestration + golden/property/error coverage

**Files:**
- Modify: `packages/questionnaire/src/index.ts` (add `compose` + `ComposeResult`)
- Create: `packages/questionnaire/test/mock-registry.ts`
- Create: `packages/questionnaire/test/fixtures/sample.questionnaire.yaml`
- Test: `packages/questionnaire/test/compose.test.ts`
- Test: `packages/questionnaire/test/errors.test.ts`

**Interfaces:**
- Consumes: `parseQuestionnaire` (Task 2), `enabledQuestions` (Task 3), `assembleDoc` (Task 4); `parseOpenui`, `serializeOpenui`, `DialectRegistry` from `@boyscout/dialect`; `AnswersT`, `ContributionT`, `QuestionnaireT`, `SpecificationT` from `@boyscout/schemas`.
- Produces: `type ComposeResult = { ok: true; spec: SpecificationT } | { ok: false; violations: string[] }`; `function compose(q: QuestionnaireT, answers: AnswersT, registry: DialectRegistry): ComposeResult`.

**Answer-completeness rule (locked):** a `single` question requires a `string` answer (missing/wrong-type → `question "x" is required`); a `multi` question treats a missing answer as an empty selection (contributes nothing, no violation), but a present non-array answer → `question "x" expects a list of values`.

- [ ] **Step 1: Create the test mock registry**

Create `packages/questionnaire/test/mock-registry.ts` (mirrors the dialect test registry; keeps this package's tests free of a bridge dependency):

```ts
import type { DialectRegistry } from "@boyscout/dialect";

const NODE_TYPES: Record<string, readonly string[]> = {
  component: ["VStack", "HStack", "Card", "Grid", "Heading", "Text", "Button"],
  service: ["Service", "Method"],
  store: ["Store", "Action"],
  http: ["Http", "Endpoint"],
};

const PARAMS: Record<string, readonly string[]> = {
  VStack: ["gap"],
  HStack: ["gap"],
  Card: [],
  Grid: ["columns"],
  Heading: ["level", "text"],
  Text: ["type", "text"],
  Button: ["variant", "text"],
  Service: ["name"],
  Method: ["name", "params", "returns"],
  Store: ["name", "state"],
  Action: ["name", "payload"],
  Http: ["name"],
  Endpoint: ["name", "method", "path", "response"],
};

export const mockRegistry: DialectRegistry = {
  capabilities: ["component", "service", "store", "http"],
  nodeTypesFor: (c) => NODE_TYPES[c] ?? [],
  paramsFor: (t) => PARAMS[t] ?? [],
};
```

- [ ] **Step 2: Create the golden fixture**

Create `packages/questionnaire/test/fixtures/sample.questionnaire.yaml`:

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
          openui: |
            Card { VStack(2) { Heading(3, "Sign in") Button("primary", "Log in") } }
      - value: dashboard
        contributes:
          id: dashboard-card
          capability: component
          openui: |
            Card { Grid(2) { Heading(3, "Overview") } }
  - id: sections
    type: multi
    prompt: Which sections?
    enabledWhen:
      screen: [dashboard]
    options:
      - value: header
        contributes:
          id: header-bar
          capability: component
          openui: 'Card { Heading(2, "Header") }'
      - value: footer
        contributes:
          id: footer-bar
          capability: component
          openui: 'Card { Text("body", "Footer") }'
```

- [ ] **Step 3: Write the failing compose test (golden + property + enable/optional integration)**

Create `packages/questionnaire/test/compose.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeOpenui } from "@boyscout/dialect";
import type { QuestionnaireT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { compose, parseQuestionnaire } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const survey = parseQuestionnaire(
  readFileSync(fileURLToPath(new URL("./fixtures/sample.questionnaire.yaml", import.meta.url)), "utf8"),
);

const CANONICAL = `spec version=1 bridge=astryx-react platform=react

component dashboard-card =
  Card {
    Grid(2) {
      Heading(3, "Overview")
    }
  }

component header-bar =
  Card {
    Heading(2, "Header")
  }

component footer-bar =
  Card {
    Text("body", "Footer")
  }
`;

describe("compose", () => {
  it("composes the sample questionnaire to the exact canonical spec (golden)", () => {
    const r = compose(survey, { screen: "dashboard", sections: ["header", "footer"] }, mockRegistry);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeOpenui(r.spec, mockRegistry)).toBe(CANONICAL);
  });

  it("is deterministic: same answers -> identical bytes across runs", () => {
    const answers = { screen: "dashboard", sections: ["header"] };
    const a = compose(survey, answers, mockRegistry);
    const b = compose(survey, answers, mockRegistry);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok)
      expect(serializeOpenui(a.spec, mockRegistry)).toBe(serializeOpenui(b.spec, mockRegistry));
  });

  it("ignores the key order of the answers object (order comes from the questionnaire)", () => {
    const forward = compose(survey, { screen: "dashboard", sections: ["header", "footer"] }, mockRegistry);
    const reversed = compose(survey, { sections: ["header", "footer"], screen: "dashboard" }, mockRegistry);
    expect(forward.ok && reversed.ok).toBe(true);
    if (forward.ok && reversed.ok)
      expect(serializeOpenui(forward.spec, mockRegistry)).toBe(
        serializeOpenui(reversed.spec, mockRegistry),
      );
  });

  it("excludes fragments from disabled questions (answer to a disabled question is ignored)", () => {
    // screen=login disables `sections` (enabledWhen screen=[dashboard]); its answer is ignored, not an error.
    const r = compose(survey, { screen: "login", sections: ["header"] }, mockRegistry);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.features.map((f) => f.id)).toEqual(["login-card"]);
  });

  it("treats a missing multi answer as an empty selection (not required)", () => {
    const s: QuestionnaireT = {
      bridge: "astryx-react",
      platform: "react",
      questions: [
        {
          id: "screen",
          type: "single",
          prompt: "?",
          options: [
            { value: "login", contributes: { id: "login-card", capability: "component", openui: "Card {}" } },
          ],
        },
        {
          id: "extras",
          type: "multi",
          prompt: "?",
          options: [
            { value: "x", contributes: { id: "x-bar", capability: "component", openui: "Card {}" } },
          ],
        },
      ],
    };
    const r = compose(s, { screen: "login" }, mockRegistry);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.features.map((f) => f.id)).toEqual(["login-card"]);
  });
});
```

- [ ] **Step 4: Write the failing error-contract test**

Create `packages/questionnaire/test/errors.test.ts`:

```ts
import type { QuestionnaireT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { compose } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const base = (questions: QuestionnaireT["questions"]): QuestionnaireT => ({
  bridge: "astryx-react",
  platform: "react",
  questions,
});
const single = (id: string, ...values: string[]): QuestionnaireT["questions"][number] => ({
  id,
  type: "single",
  prompt: id,
  options: values.map((v) => ({
    value: v,
    contributes: { id: `${v}-f`, capability: "component", openui: `Card { Heading(2, "${v}") }` },
  })),
});

describe("compose error contract", () => {
  it("reports a required single question with no answer", () => {
    const r = compose(base([single("screen", "login")]), {}, mockRegistry);
    expect(r).toEqual({ ok: false, violations: ['question "screen" is required'] });
  });

  it("reports an answer value that is not an option", () => {
    const r = compose(base([single("screen", "login")]), { screen: "signup" }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain('"signup" is not an option of "screen"');
  });

  it("reports an answer to an unknown question", () => {
    const r = compose(base([single("screen", "login")]), { screen: "login", colour: "red" }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain('unknown question "colour"');
  });

  it("reports a duplicate feature id across selected fragments", () => {
    const survey = base([
      {
        id: "sections",
        type: "multi",
        prompt: "sections",
        options: [
          { value: "a", contributes: { id: "dup", capability: "component", openui: "Card {}" } },
          { value: "b", contributes: { id: "dup", capability: "component", openui: "Card {}" } },
        ],
      },
    ]);
    const r = compose(survey, { sections: ["a", "b"] }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain('duplicate feature id "dup"');
  });

  it("surfaces a downstream parse/gate violation for a bad fragment", () => {
    const survey = base([
      {
        id: "screen",
        type: "single",
        prompt: "screen",
        options: [{ value: "x", contributes: { id: "bad", capability: "component", openui: "Bogus {}" } }],
      },
    ]);
    const r = compose(survey, { screen: "x" }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]).toMatch(/unknown node type "Bogus"/);
  });

  it("reports a non-array answer supplied to a multi question", () => {
    const survey = base([
      {
        id: "sections",
        type: "multi",
        prompt: "sections",
        options: [{ value: "a", contributes: { id: "a-f", capability: "component", openui: "Card {}" } }],
      },
    ]);
    const r = compose(survey, { sections: "a" }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain('question "sections" expects a list of values');
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `npx vitest run packages/questionnaire/test/compose.test.ts packages/questionnaire/test/errors.test.ts`
Expected: FAIL — `compose` is not exported from `../src/index.js`.

- [ ] **Step 6: Implement `compose`**

Append to `packages/questionnaire/src/index.ts`:

```ts
import { type DialectRegistry, parseOpenui } from "@boyscout/dialect";
import type { AnswersT, ContributionT, SpecificationT } from "@boyscout/schemas";
import { assembleDoc } from "./assemble.js";
import { enabledQuestions } from "./enabled.js";

export type ComposeResult =
  | { ok: true; spec: SpecificationT }
  | { ok: false; violations: string[] };

/**
 * Compose a closed questionnaire + closed answers into a validated Specification.
 * Validates answers against the enabled questions, collects the selected fragments in
 * declaration order, assembles a .openui document, and runs it through SP4a's
 * parseOpenui (bind + 422 gate). Returns every problem it finds as a violations list;
 * a clean run returns the validated spec. Answers to disabled questions are ignored.
 */
export function compose(
  q: QuestionnaireT,
  answers: AnswersT,
  registry: DialectRegistry,
): ComposeResult {
  const violations: string[] = [];
  const enabled = enabledQuestions(q, answers);

  // Typo protection: any answered id that is not a question at all.
  const allIds = new Set(q.questions.map((qq) => qq.id));
  for (const id of Object.keys(answers)) {
    if (!allIds.has(id)) violations.push(`unknown question "${id}"`);
  }

  // Validate each enabled question's answer; collect the selected contributions in order.
  const contributions: ContributionT[] = [];
  const featureIds = new Set<string>();
  for (const question of enabled) {
    const answer = answers[question.id];
    let selected: string[];
    if (question.type === "single") {
      if (typeof answer !== "string") {
        violations.push(`question "${question.id}" is required`);
        continue;
      }
      selected = [answer];
    } else if (answer === undefined) {
      selected = [];
    } else if (Array.isArray(answer)) {
      selected = answer;
    } else {
      violations.push(`question "${question.id}" expects a list of values`);
      continue;
    }

    const optionByValue = new Map(question.options.map((o) => [o.value, o]));
    for (const value of selected) {
      const opt = optionByValue.get(value);
      if (!opt) {
        violations.push(`"${value}" is not an option of "${question.id}"`);
        continue;
      }
      const c = opt.contributes;
      if (featureIds.has(c.id)) violations.push(`duplicate feature id "${c.id}"`);
      featureIds.add(c.id);
      contributions.push(c);
    }
  }

  if (violations.length > 0) return { ok: false, violations };

  // Assemble + run SP4a's proven parse + 422 gate; surface any thrown violation verbatim.
  const doc = assembleDoc(q.bridge, q.platform, contributions);
  try {
    return { ok: true, spec: parseOpenui(doc, registry) };
  } catch (e) {
    return { ok: false, violations: [(e as Error).message] };
  }
}
```

Note: `QuestionnaireT` is already imported at the top of the file (Task 2). If your editor's import organizer merges the two `@boyscout/schemas` import lines into one, that is fine — keep a single `import type { AnswersT, ContributionT, QuestionnaireT, QuestionT, SpecificationT } from "@boyscout/schemas";` line.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run packages/questionnaire/test/`
Expected: PASS — `parse` (6) + `enabled` (6) + `assemble` (2) + `compose` (5) + `errors` (6).

- [ ] **Step 8: Typecheck**

Run: `pnpm --filter @boyscout/questionnaire typecheck`
Expected: no errors.

- [ ] **Step 9: Format check**

Run: `pnpm format:check`
Expected: no formatting diffs (run `pnpm format` if any, then re-check).

- [ ] **Step 10: Commit**

```bash
git add packages/questionnaire/src/index.ts packages/questionnaire/test/mock-registry.ts packages/questionnaire/test/fixtures/sample.questionnaire.yaml packages/questionnaire/test/compose.test.ts packages/questionnaire/test/errors.test.ts
git commit -m "feat(questionnaire): compose() answers->Specification via SP4a pipeline; golden/property/error tests (SP5a)"
```

---

### Task 6: Whole-suite + typecheck green (branch verification)

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: all suites green, including the existing SP1–SP4 tests and the new `@boyscout/questionnaire` suites.

- [ ] **Step 2: Full typecheck**

Run: `pnpm -r typecheck`
Expected: no errors across all packages.

- [ ] **Step 3: Format check**

Run: `pnpm format:check`
Expected: clean.

*(Biome lint is CI-authoritative and OOMs locally — do not run it here; CI verifies it on push.)*

No commit — this task gates the branch before the final whole-branch review.

---

## Self-Review

**1. Spec coverage:**
- Package `@boyscout/questionnaire` + schema in `@boyscout/schemas` → Tasks 1, 2. ✅
- `compose()` = assemble → `parseOpenui` pipeline → Task 5. ✅
- Inline fragments, pure selection (no placeholders) → schema (Task 1) has no slot mechanism; `assembleDoc` does no substitution. ✅
- single + multi question types → Task 1 `z.enum(["single","multi"])`; Task 5 answer handling. ✅
- Closed `enabledWhen` (AND / any-of / includes, forward-only) → Task 3 + parse-time forward-ref check (Task 2). ✅
- `parseQuestionnaire` throws; `compose` returns Result → Tasks 2, 5. ✅
- Error contract (required / not-an-option / unknown-question / duplicate-id / gate-failure) → Task 5 `errors.test.ts`, one test per row + the multi-type-mismatch case. ✅
- Determinism + golden + property + enabledWhen unit + error-case tests → Tasks 3, 5. ✅
- bridge/platform in header; caller passes registry → `assembleDoc` args + `compose` registry param. ✅
- `yaml@2.9.0` reused, no new dep → Task 2 `package.json`. ✅
- Deferred (UI, SSE, annotations, placeholders, CLI wiring) → not present in any task. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps; every code step carries complete code and exact run commands. ✅

**3. Type consistency:** `QuestionnaireT`/`QuestionT`/`ContributionT`/`AnswersT` (Task 1) are consumed with identical names in Tasks 2–5. `enabledQuestions(q, answers): QuestionT[]` (Task 3) and `assembleDoc(bridge, platform, contributions): string` (Task 4) match their call sites in `compose` (Task 5). `ComposeResult` discriminant `{ ok }` matches every test's `if (r.ok)` guard. ✅

## Deferred (SP5b / later)
Questionnaire UI (Astryx-rendered form), SSE live-workspace streaming, per-node annotations UI + context enrichment, CLI/daemon wiring + questionnaire-file discovery, Playwright E2E of the guided flow, placeholder substitution, `enabledWhen` negation, `metadata.checksum`.
