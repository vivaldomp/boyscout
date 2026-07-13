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
