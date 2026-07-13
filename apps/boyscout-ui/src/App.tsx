import type { AnswersT, FeatureT, QuestionnaireT } from "@boyscout/schemas";
import { Renderer } from "@boyscout/renderer";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { makeClient } from "./api.js";
import { astryxMap } from "./astryx-map.js";
import { AnswerContext, formComponents } from "./form-components.js";
import { flattenPaths, questionnaireToTree, toggleAnswer } from "./questionnaire-tree.js";

type Client = ReturnType<typeof makeClient>;

export function App({ client }: { client: Client }): ReactElement {
  const [text, setText] = useState("");
  const [features, setFeatures] = useState<FeatureT[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState("");
  const [questionnaire, setQuestionnaire] = useState<QuestionnaireT | null>(null);
  const [answers, setAnswers] = useState<AnswersT>({});
  const [violations, setViolations] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<Record<string, Record<string, string>>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void client.state().then((s) => {
      setText(s.openui);
      setFeatures(s.ast?.features ?? []);
      setApprovals(s.approvals);
      setErrors(s.errors);
      setAnnotations(s.annotations);
    });
    void client.questionnaire().then(setQuestionnaire);
  }, [client]);

  // Guided mode: debounce-compose whenever answers change; stream features into the preview.
  useEffect(() => {
    if (!questionnaire) return;
    if (composeTimer.current) clearTimeout(composeTimer.current);
    composeTimer.current = setTimeout(() => {
      const streamed: FeatureT[] = [];
      setViolations([]);
      void client.composeStream(answers, (e) => {
        if (e.event === "feature") {
          streamed.push(JSON.parse(e.data) as FeatureT);
          setFeatures([...streamed]);
        } else if (e.event === "violations") {
          setViolations((JSON.parse(e.data) as { violations: string[] }).violations);
        } else if (e.event === "done") {
          const d = JSON.parse(e.data) as { openui: string; spec: { features: FeatureT[] } };
          setText(d.openui);
          setFeatures(d.spec.features);
          void client.state().then((s) => {
            setApprovals(s.approvals);
            setAnnotations(s.annotations);
            setErrors(s.errors);
          });
        }
      });
    }, 250);
  }, [answers, questionnaire, client]);

  const onEdit = (next: string): void => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void client.parse(next).then((r) => {
        setErrors(r.errors);
        if (r.ok && r.ast) setFeatures(r.ast.features);
      });
      void client.state().then((s) => {
        setApprovals(s.approvals);
        setAnnotations(s.annotations);
      });
    }, 250);
  };

  const onAnswer = (qid: string, value: string, kind: string): void =>
    setAnswers((a) => toggleAnswer(a, qid, value, kind));

  const toggle = (id: string, approved: boolean): void => {
    void client.approve(id, approved).then((r) => setApprovals(r.approvals));
  };

  const setNote = (featureId: string, pathKey: string, note: string): void => {
    setAnnotations((prev) => ({ ...prev, [featureId]: { ...(prev[featureId] ?? {}), [pathKey]: note } }));
    void client.annotate(featureId, pathKey, note).then((r) =>
      setAnnotations((prev) => ({ ...prev, [featureId]: r.annotations })),
    );
  };

  const commit = (): void => {
    void client.commit().then((r) => {
      setMessage(
        r.ok ? `Wrote: ${r.written?.join(", ")}` : `Cannot write: ${r.violations?.join("; ")}`,
      );
    });
  };

  const allApproved = features.length > 0 && features.every((f) => approvals[f.id]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100vh", padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
        {questionnaire && (
          <AnswerContext.Provider value={{ answers, onAnswer }}>
            <Renderer ast={questionnaireToTree(questionnaire, answers)} components={formComponents} />
          </AnswerContext.Provider>
        )}
        {violations.length > 0 && (
          <ul data-testid="violations" style={{ color: "crimson", fontFamily: "monospace" }}>
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        )}
        <textarea
          data-testid="editor"
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          style={{ flex: 1, minHeight: 120, fontFamily: "monospace", fontSize: 13 }}
        />
        {errors.length > 0 && (
          <ul data-testid="errors" style={{ color: "crimson", fontFamily: "monospace" }}>
            {errors.map((e) => (
              <li key={`${e.line}:${e.message}`}>
                line {e.line}: {e.message}
              </li>
            ))}
          </ul>
        )}
        <div>
          {features.map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                data-testid={`approve-${f.id}`}
                checked={!!approvals[f.id]}
                onChange={(e) => toggle(f.id, e.target.checked)}
              />
              {f.capability} {f.id}
            </label>
          ))}
          <button type="button" data-testid="commit" disabled={!allApproved} onClick={commit}>
            Write spec
          </button>
          <span data-testid="message">{message}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
        <div data-testid="preview" style={{ flex: 1, overflow: "auto", border: "1px solid #ddd" }}>
          {features.map((f) => (
            <div key={f.id}>
              <Renderer ast={f.tree} components={astryxMap} />
            </div>
          ))}
        </div>
        <div data-testid="annotations">
          {features.map((f) => (
            <div key={f.id}>
              <strong>{f.id}</strong>
              {flattenPaths(f.tree).map(({ pathKey, type }) => (
                <label key={pathKey || "root"} style={{ display: "block", fontSize: 12 }}>
                  {pathKey || "root"} · {type}
                  <input
                    data-testid={`annotate-${f.id}-${pathKey}`}
                    value={annotations[f.id]?.[pathKey] ?? ""}
                    onChange={(e) => setNote(f.id, pathKey, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
