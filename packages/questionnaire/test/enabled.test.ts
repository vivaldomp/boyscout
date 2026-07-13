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
