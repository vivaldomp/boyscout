import type { ComponentMap, NodeComponent } from "@boyscout/renderer";
import type { AnswersT } from "@boyscout/schemas";
import { createContext, useContext } from "react";

export interface AnswerCtx {
  answers: AnswersT;
  onAnswer: (qid: string, value: string, kind: string) => void;
}
export const AnswerContext = createContext<AnswerCtx>({ answers: {}, onAnswer: () => {} });

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function isChecked(answers: AnswersT, qid: string, value: string): boolean {
  const a = answers[qid];
  return Array.isArray(a) ? a.includes(value) : a === value;
}

const FormNode: NodeComponent = ({ children }) => (
  <div data-testid="questionnaire-form">{children}</div>
);

const QuestionNode: NodeComponent = ({ node, children }) => (
  <fieldset data-qid={str(node.props?.qid)}>
    <legend>{str(node.props?.prompt)}</legend>
    {children}
  </fieldset>
);

const OptionNode: NodeComponent = ({ node }) => {
  const { answers, onAnswer } = useContext(AnswerContext);
  const qid = str(node.props?.qid);
  const value = str(node.props?.value);
  const kind = str(node.props?.kind);
  return (
    <label style={{ display: "block" }}>
      <input
        type={kind === "single" ? "radio" : "checkbox"}
        name={qid}
        data-testid={`opt-${qid}-${value}`}
        checked={isChecked(answers, qid, value)}
        onChange={() => onAnswer(qid, value, kind)}
      />
      {value}
    </label>
  );
};

export const formComponents: ComponentMap = {
  Form: FormNode,
  Question: QuestionNode,
  Option: OptionNode,
};
