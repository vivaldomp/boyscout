import type { FeatureT } from "@boyscout/schemas";
import { Renderer } from "@boyscout/renderer";
import { type ReactElement, useEffect, useRef, useState } from "react";
import type { makeClient } from "./api.js";
import { astryxMap } from "./astryx-map.js";

type Client = ReturnType<typeof makeClient>;

export function App({ client }: { client: Client }): ReactElement {
  const [text, setText] = useState("");
  const [features, setFeatures] = useState<FeatureT[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<{ line: number; message: string }[]>([]);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void client.state().then((s) => {
      setText(s.openui);
      setFeatures(s.ast?.features ?? []);
      setApprovals(s.approvals);
      setErrors(s.errors);
    });
  }, [client]);

  const onEdit = (next: string): void => {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void client.parse(next).then((r) => {
        setErrors(r.errors);
        if (r.ok && r.ast) setFeatures(r.ast.features);
      });
      void client.state().then((s) => setApprovals(s.approvals));
    }, 250);
  };

  const toggle = (id: string, approved: boolean): void => {
    void client.approve(id, approved).then((r) => setApprovals(r.approvals));
  };

  const commit = (): void => {
    void client.commit().then((r) => {
      setMessage(r.ok ? `Wrote: ${r.written?.join(", ")}` : `Cannot write: ${r.violations?.join("; ")}`);
    });
  };

  const allApproved = features.length > 0 && features.every((f) => approvals[f.id]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, height: "100vh", padding: 12 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <textarea
          data-testid="editor"
          value={text}
          onChange={(e) => onEdit(e.target.value)}
          style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
        />
        {errors.length > 0 && (
          <ul data-testid="errors" style={{ color: "crimson", fontFamily: "monospace" }}>
            {errors.map((e, i) => (
              <li key={i}>line {e.line}: {e.message}</li>
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
      <div data-testid="preview" style={{ overflow: "auto", border: "1px solid #ddd" }}>
        {features.map((f) => (
          <div key={f.id}>
            <Renderer ast={f.tree} components={astryxMap} />
          </div>
        ))}
      </div>
    </div>
  );
}
