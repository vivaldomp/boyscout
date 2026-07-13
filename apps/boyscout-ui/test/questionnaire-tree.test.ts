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
        {
          value: "login",
          contributes: {
            id: "login-card",
            capability: "component",
            openui: 'Card { Heading(3, "Sign in") }',
          },
        },
        {
          value: "dashboard",
          contributes: {
            id: "dash",
            capability: "component",
            openui: 'Card { Grid(2) { Heading(3, "Overview") } }',
          },
        },
      ],
    },
    {
      id: "sections",
      type: "multi",
      prompt: "Which sections?",
      enabledWhen: { screen: ["dashboard"] },
      options: [
        {
          value: "header",
          contributes: {
            id: "header-bar",
            capability: "component",
            openui: 'Card { Heading(2, "Header") }',
          },
        },
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
    expect(screen?.children?.[0]?.props).toMatchObject({
      qid: "screen",
      value: "login",
      kind: "single",
    });
  });
});

describe("toggleAnswer", () => {
  it("single sets, multi toggles", () => {
    expect(toggleAnswer({}, "screen", "login", "single")).toEqual({ screen: "login" });
    expect(toggleAnswer({ screen: "login" }, "screen", "dashboard", "single")).toEqual({
      screen: "dashboard",
    });
    expect(toggleAnswer({}, "sections", "header", "multi")).toEqual({ sections: ["header"] });
    expect(toggleAnswer({ sections: ["header"] }, "sections", "header", "multi")).toEqual({
      sections: [],
    });
    expect(toggleAnswer({ sections: ["header"] }, "sections", "footer", "multi")).toEqual({
      sections: ["header", "footer"],
    });
  });
});

describe("flattenPaths", () => {
  it("lists every node's positional path and type", () => {
    const tree = {
      type: "Card",
      children: [{ type: "Heading" }, { type: "Grid", children: [{ type: "Text" }] }],
    };
    expect(flattenPaths(tree)).toEqual([
      { pathKey: "", type: "Card" },
      { pathKey: "0", type: "Heading" },
      { pathKey: "1", type: "Grid" },
      { pathKey: "1.0", type: "Text" },
    ]);
  });
});
