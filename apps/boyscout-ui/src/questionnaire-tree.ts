import { enabledQuestions } from "@boyscout/questionnaire/enabled";
import type { AnswersT, AstNodeT, QuestionnaireT } from "@boyscout/schemas";

/** Build a Form>Question>Option tree of the enabled questions. Structure is a pure function of (q, answers). */
export function questionnaireToTree(q: QuestionnaireT, answers: AnswersT): AstNodeT {
  return {
    type: "Form",
    children: enabledQuestions(q, answers).map((question) => ({
      type: "Question",
      props: { qid: question.id, prompt: question.prompt, kind: question.type },
      children: question.options.map((o) => ({
        type: "Option",
        props: { qid: question.id, value: o.value, kind: question.type },
      })),
    })),
  };
}

/** Next answers after clicking an option: single replaces, multi toggles membership. */
export function toggleAnswer(answers: AnswersT, qid: string, value: string, kind: string): AnswersT {
  if (kind === "single") return { ...answers, [qid]: value };
  const cur = answers[qid];
  const list = Array.isArray(cur) ? cur : [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...answers, [qid]: next };
}

/** Every node's positional path (dot-joined child indices; "" = root) and type, pre-order. */
export function flattenPaths(tree: AstNodeT, prefix = ""): { pathKey: string; type: string }[] {
  const out = [{ pathKey: prefix, type: tree.type }];
  (tree.children ?? []).forEach((c, i) =>
    out.push(...flattenPaths(c, prefix === "" ? String(i) : `${prefix}.${i}`)),
  );
  return out;
}
