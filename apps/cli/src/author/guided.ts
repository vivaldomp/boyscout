import { type DialectRegistry, serializeOpenui } from "@boyscout/dialect";
import { compose } from "@boyscout/questionnaire";
import type { AnswersT, QuestionnaireT } from "@boyscout/schemas";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";

/**
 * Guided-authoring routes. `getQuestionnaire` returns the parsed questionnaire (or undefined
 * when none was configured); `seed` re-parses the composed .openui into session state (reusing
 * the daemon's reparse so approvals/annotations/errors stay consistent).
 */
export function registerGuided(
  app: Hono,
  registry: DialectRegistry,
  getQuestionnaire: () => QuestionnaireT | undefined,
  seed: (openui: string) => void,
): void {
  app.get("/api/questionnaire", (c) => {
    const q = getQuestionnaire();
    return q ? c.json(q) : c.json({ error: "no questionnaire" }, 404);
  });

  app.post("/api/compose", async (c) => {
    const q = getQuestionnaire();
    if (!q) return c.json({ error: "no questionnaire" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { answers?: AnswersT };
    const result = compose(q, body.answers ?? {}, registry);
    return streamSSE(c, async (stream) => {
      if (!result.ok) {
        await stream.writeSSE({ event: "violations", data: JSON.stringify({ violations: result.violations }) });
        return;
      }
      for (const f of result.spec.features) {
        await stream.writeSSE({ event: "feature", data: JSON.stringify(f) });
      }
      const openui = serializeOpenui(result.spec, registry);
      seed(openui);
      await stream.writeSSE({ event: "done", data: JSON.stringify({ openui, spec: result.spec }) });
    });
  });
}
