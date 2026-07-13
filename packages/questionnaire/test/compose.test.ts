import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serializeOpenui } from "@boyscout/dialect";
import type { QuestionnaireT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { compose, parseQuestionnaire } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const survey = parseQuestionnaire(
  readFileSync(
    fileURLToPath(new URL("./fixtures/sample.questionnaire.yaml", import.meta.url)),
    "utf8",
  ),
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
    const r = compose(
      survey,
      { screen: "dashboard", sections: ["header", "footer"] },
      mockRegistry,
    );
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
    const forward = compose(
      survey,
      { screen: "dashboard", sections: ["header", "footer"] },
      mockRegistry,
    );
    const reversed = compose(
      survey,
      { sections: ["header", "footer"], screen: "dashboard" },
      mockRegistry,
    );
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
            {
              value: "login",
              contributes: { id: "login-card", capability: "component", openui: "Card {}" },
            },
          ],
        },
        {
          id: "extras",
          type: "multi",
          prompt: "?",
          options: [
            {
              value: "x",
              contributes: { id: "x-bar", capability: "component", openui: "Card {}" },
            },
          ],
        },
      ],
    };
    const r = compose(s, { screen: "login" }, mockRegistry);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.features.map((f) => f.id)).toEqual(["login-card"]);
  });
});
