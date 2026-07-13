import { registry } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { type AuthState, createAuthApp } from "../src/author/app.js";

const TOKEN = "test-token";
const auth = { Authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };
const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make() {
  return createAuthApp({
    registry,
    token: TOKEN,
    selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: OPENUI,
    specPath: "/tmp/x/spec.json",
    openuiPath: "/tmp/x/b.openui",
    projectRoot: "/tmp/x",
  });
}
const annotate = (app: ReturnType<typeof make>["app"], body: unknown) =>
  app.request("/api/annotate", { method: "POST", headers: auth, body: JSON.stringify(body) });
const parse = (app: ReturnType<typeof make>["app"], text: string) =>
  app.request("/api/parse", { method: "POST", headers: auth, body: JSON.stringify({ text }) });
const state = async (app: ReturnType<typeof make>["app"]) =>
  (await (await app.request("/api/state", { headers: auth })).json()) as AuthState;

describe("annotations side-car", () => {
  it("stores a note at a node path and returns it in state", async () => {
    const { app } = make();
    const res = await annotate(app, { featureId: "card", path: "0", note: "the text node" });
    expect(((await res.json()) as { annotations: Record<string, string> }).annotations).toEqual({
      "0": "the text node",
    });
    expect((await state(app)).annotations).toEqual({ card: { "0": "the text node" } });
  });

  it("survives a reparse that leaves the node unchanged, drops when the node changes", async () => {
    const { app } = make();
    await annotate(app, { featureId: "card", path: "0", note: "n" });
    await parse(app, OPENUI.replace("Card {", "Card { \n")); // whitespace-only: canonical tree unchanged
    expect((await state(app)).annotations).toEqual({ card: { "0": "n" } });
    await parse(app, OPENUI.replace('"hello"', '"changed"')); // node 0 changes -> drop
    expect((await state(app)).annotations).toEqual({});
  });

  it("empty note clears the annotation", async () => {
    const { app } = make();
    await annotate(app, { featureId: "card", path: "0", note: "n" });
    await annotate(app, { featureId: "card", path: "0", note: "" });
    expect((await state(app)).annotations).toEqual({});
  });

  it("ignores an unknown feature or path", async () => {
    const { app } = make();
    await annotate(app, { featureId: "nope", path: "0", note: "n" });
    await annotate(app, { featureId: "card", path: "9.9", note: "n" });
    // malformed paths with empty segments
    await annotate(app, { featureId: "card", path: "0.", note: "n" });
    await annotate(app, { featureId: "card", path: ".0", note: "n" });
    expect((await state(app)).annotations).toEqual({});
  });
});
