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
