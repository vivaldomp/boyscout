import { type DialectRegistry, parseOpenui } from "@boyscout/dialect";
import {
  Questionnaire,
  type AnswersT,
  type ContributionT,
  type QuestionT,
  type QuestionnaireT,
  type SpecificationT,
} from "@boyscout/schemas";
import { parse as parseYaml } from "yaml";
import { assembleDoc } from "./assemble.js";
import { enabledQuestions } from "./enabled.js";

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
