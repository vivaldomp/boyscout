import { registry } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { type AuthState, createAuthApp } from "../src/author/app.js";

interface ParseResponse {
  ok: boolean;
  errors: { line: number; message: string }[];
}

const TOKEN = "test-token";
const ORIGIN = "http://127.0.0.1:4517";
const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make() {
  return createAuthApp({
    registry,
    token: TOKEN,
    selfOrigin: ORIGIN,
    initialOpenui: OPENUI,
    specPath: "/tmp/x/boyscout-spec.json",
    openuiPath: "/tmp/x/boyscout.openui",
    projectRoot: "/tmp/x",
  });
}
const auth = { Authorization: `Bearer ${TOKEN}` };

describe("author daemon: security", () => {
  it("rejects /api without a token (401)", async () => {
    const { app } = make();
    const res = await app.request("/api/state");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token (401)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: { Authorization: "Bearer nope" } });
    expect(res.status).toBe(401);
  });

  it("rejects a foreign Origin (403)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", {
      headers: { ...auth, Origin: "http://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("allows a valid token with matching Origin", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: { ...auth, Origin: ORIGIN } });
    expect(res.status).toBe(200);
  });
});

describe("author daemon: parse + approve", () => {
  it("loads initial openui and starts every feature as draft (unapproved)", async () => {
    const { app } = make();
    const res = await app.request("/api/state", { headers: auth });
    const body = (await res.json()) as AuthState;
    expect(body.errors).toEqual([]);
    expect(body.ast?.features).toHaveLength(1);
    expect(body.approvals).toEqual({ card: false });
  });

  it("returns line-numbered errors for bad openui and keeps the last good ast", async () => {
    const { app } = make();
    const res = await app.request("/api/parse", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ text: 'component bad =\n  Card {\n    Text("body", "x)\n  }' }),
    });
    const body = (await res.json()) as ParseResponse;
    expect(body.ok).toBe(false);
    expect(body.errors[0]?.line).toBeGreaterThan(0);
    // last good ast preserved:
    const state = (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;
    expect(state.ast?.features).toHaveLength(1);
  });

  it("approve flips a feature; a re-parse that changes it resets to draft", async () => {
    const { app } = make();
    await app.request("/api/approve", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ featureId: "card", approved: true }),
    });
    let state = (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;
    expect(state.approvals.card).toBe(true);

    // edit the card feature -> its signature changes -> approval resets
    await app.request("/api/parse", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ text: OPENUI.replace('"hello"', '"changed"') }),
    });
    state = (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;
    expect(state.approvals.card).toBe(false);
  });
});
