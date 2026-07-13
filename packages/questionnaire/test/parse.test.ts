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
