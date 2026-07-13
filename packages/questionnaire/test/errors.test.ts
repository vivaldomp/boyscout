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
    const r = compose(
      base([single("screen", "login")]),
      { screen: "login", colour: "red" },
      mockRegistry,
    );
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
        options: [
          { value: "x", contributes: { id: "bad", capability: "component", openui: "Bogus {}" } },
        ],
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
        options: [
          { value: "a", contributes: { id: "a-f", capability: "component", openui: "Card {}" } },
        ],
      },
    ]);
    const r = compose(survey, { sections: "a" }, mockRegistry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations).toContain('question "sections" expects a list of values');
  });
});
