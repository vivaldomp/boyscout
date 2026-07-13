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
