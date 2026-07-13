import { registry } from "@boyscout/bridge-astryx-react";
import { parseQuestionnaire } from "@boyscout/questionnaire";
import { describe, expect, it } from "vitest";
import { createAuthApp, type AuthState } from "../src/author/app.js";

const TOKEN = "test-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const YAML = `bridge: astryx-react
platform: react
questions:
  - id: screen
    type: single
    prompt: Screen?
    options:
      - value: dashboard
        contributes:
          id: dash
          capability: component
          openui: 'Card { Grid(2) { Heading(3, "Overview") } }'
`;

function make() {
  return createAuthApp({
    registry,
    token: TOKEN,
    selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: "",
    specPath: "/tmp/x/spec.json",
    openuiPath: "/tmp/x/b.openui",
    projectRoot: "/tmp/x",
    questionnaire: parseQuestionnaire(YAML),
  });
}
const compose = (app: ReturnType<typeof make>["app"], answers: unknown) =>
  app.request("/api/compose", { method: "POST", headers: auth, body: JSON.stringify({ answers }) });

/** Collect SSE frames from a Response body into {event,data} pairs. */
async function frames(res: Response): Promise<{ event: string; data: string }[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((f) => f.includes("data:"))
    .map((f) => {
      let event = "message";
      const data: string[] = [];
      for (const line of f.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      return { event, data: data.join("\n") };
    });
}

describe("guided endpoints", () => {
  it("serves the questionnaire", async () => {
    const { app } = make();
    const res = await app.request("/api/questionnaire", { headers: auth });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { questions: { id: string }[] }).questions[0]!.id).toBe("screen");
  });

  it("returns 404 when no questionnaire is configured", async () => {
    const app2 = createAuthApp({
      registry,
      token: TOKEN,
      selfOrigin: "http://127.0.0.1:4517",
      initialOpenui: "",
      specPath: "/tmp/x/s.json",
      openuiPath: "/tmp/x/b.openui",
      projectRoot: "/tmp/x",
    }).app;
    expect((await app2.request("/api/questionnaire", { headers: auth })).status).toBe(404);
  });

  it("streams feature then done for a valid answer set and seeds the editor", async () => {
    const { app } = make();
    const evs = await frames(await compose(app, { screen: "dashboard" }));
    expect(evs.map((e) => e.event)).toEqual(["feature", "done"]);
    expect(JSON.parse(evs[0]!.data).id).toBe("dash");
    const done = JSON.parse(evs[1]!.data);
    expect(done.openui).toContain("Overview");
    expect(done.spec.features).toHaveLength(1);
    // seeded into session state:
    const state = (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;
    expect(state.ast!.features[0]!.id).toBe("dash");
    expect(state.approvals).toEqual({ dash: false });
  });

  it("emits a single violations event for an incomplete answer set", async () => {
    const { app } = make();
    const evs = await frames(await compose(app, {}));
    expect(evs.map((e) => e.event)).toEqual(["violations"]);
    expect(JSON.parse(evs[0]!.data).violations[0]).toContain("required");
  });
});
