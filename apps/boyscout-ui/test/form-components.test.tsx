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
    {
      id: "screen",
      type: "single",
      prompt: "Screen?",
      options: [
        { value: "login", contributes: { id: "a", capability: "component", openui: "Card {}" } },
        {
          value: "dashboard",
          contributes: { id: "b", capability: "component", openui: "Card {}" },
        },
      ],
    },
  ],
};

function html(ast: AstNodeT, answers: Record<string, string | string[]>): string {
  return renderToStaticMarkup(
    createElement(
      AnswerContext.Provider,
      { value: { answers, onAnswer: () => {} } },
      createElement(Renderer, { ast, components: formComponents }),
    ),
  );
}

describe("formComponents", () => {
  it("renders single as radios and marks the selected one checked", () => {
    const out = html(questionnaireToTree(Q, { screen: "dashboard" }), { screen: "dashboard" });
    expect(out).toContain('type="radio"');
    expect(out).toContain("Screen?");
    // exactly one radio is checked, and it is the dashboard input (its testid precedes `checked`)
    expect((out.match(/checked=""/g) ?? []).length).toBe(1);
    const dashInput = out.slice(
      out.indexOf("opt-screen-dashboard"),
      out.indexOf("opt-screen-dashboard") + 60,
    );
    expect(dashInput).toContain("checked");
  });

  it("renders multi options as checkboxes", () => {
    const q0 = Q.questions[0];
    if (!q0) throw new Error("fixture must have a question");
    const multi: QuestionnaireT = { ...Q, questions: [{ ...q0, type: "multi" }] };
    const out = html(questionnaireToTree(multi, {}), {});
    expect(out).toContain('type="checkbox"');
  });
});
