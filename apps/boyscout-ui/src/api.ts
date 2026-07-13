import type { AnswersT, QuestionnaireT, SpecificationT } from "@boyscout/schemas";
import { postSse, type SseEvent } from "./sse.js";

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
  annotations: Record<string, Record<string, string>>;
}

/** Read the session token from the URL fragment (`#t=…`). Fragments are never sent to the server or in Referer. */
export function readToken(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("t") ?? "";
}

export function makeClient(token: string, fetchImpl: typeof fetch = fetch) {
  const headers = { Authorization: `Bearer ${token}`, "content-type": "application/json" };
  const post = async (path: string, body: unknown): Promise<unknown> => {
    const res = await fetchImpl(path, { method: "POST", headers, body: JSON.stringify(body) });
    return res.json();
  };
  return {
    state: async (): Promise<AuthState> => (await fetchImpl("/api/state", { headers })).json(),
    parse: (text: string) =>
      post("/api/parse", { text }) as Promise<{
        ok: boolean;
        ast: SpecificationT | null;
        errors: AuthState["errors"];
      }>,
    approve: (featureId: string, approved: boolean) =>
      post("/api/approve", { featureId, approved }) as Promise<{
        approvals: Record<string, boolean>;
      }>,
    commit: () =>
      post("/api/commit", {}) as Promise<{
        ok: boolean;
        written?: string[];
        violations?: string[];
      }>,
    questionnaire: async (): Promise<QuestionnaireT | null> => {
      const res = await fetchImpl("/api/questionnaire", { headers });
      return res.ok ? ((await res.json()) as QuestionnaireT) : null;
    },
    composeStream: (answers: AnswersT, onEvent: (e: SseEvent) => void): Promise<void> =>
      postSse("/api/compose", { answers }, headers, onEvent, fetchImpl),
    annotate: (featureId: string, path: string, note: string) =>
      post("/api/annotate", { featureId, path, note }) as Promise<{
        annotations: Record<string, string>;
      }>,
  };
}
