import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registry } from "@boyscout/bridge-astryx-react";
import { canonicalJson, hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui } from "@boyscout/dialect";
import { describe, expect, it } from "vitest";
import { createAuthApp } from "../src/author/app.js";

const OPENUI = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    Text("body", "hello")
  }`;

function make(root: string) {
  return createAuthApp({
    registry,
    token: "t",
    selfOrigin: "http://127.0.0.1:4517",
    initialOpenui: OPENUI,
    specPath: join(root, "boyscout-spec.json"),
    openuiPath: join(root, "boyscout.openui"),
    projectRoot: root,
  });
}
const auth = { Authorization: "Bearer t", "content-type": "application/json" };

describe("author daemon: commit gate", () => {
  it("rejects commit while a feature is unapproved (422)", async () => {
    const root = mkdtempSync(join(tmpdir(), "bs-"));
    const { app } = make(root);
    const res = await app.request("/api/commit", { method: "POST", headers: auth });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; violations: string[] };
    expect(body.ok).toBe(false);
    expect(
      body.violations.some((v: string) => v.includes("card") && v.includes("not approved")),
    ).toBe(true);
  });

  it("writes canonical spec.json + .openui (byte-identical to the determinism path) once approved", async () => {
    const root = mkdtempSync(join(tmpdir(), "bs-"));
    const { app } = make(root);
    await app.request("/api/approve", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ featureId: "card", approved: true }),
    });
    const res = await app.request("/api/commit", { method: "POST", headers: auth });
    expect(res.status).toBe(200);

    const spec = parseOpenui(OPENUI, registry);
    expect(hash(readFileSync(join(root, "boyscout-spec.json")))).toBe(
      hash(writeBytes(canonicalJson(spec))),
    );
    // the .openui round-trips: re-parsing the written file yields the same spec
    const writtenOpenui = readFileSync(join(root, "boyscout.openui"), "utf8");
    expect(parseOpenui(writtenOpenui, registry)).toEqual(spec);
  });

  it("rejects commit of a header-only spec with zero features (422)", async () => {
    const root = mkdtempSync(join(tmpdir(), "bs-"));
    const { app } = createAuthApp({
      registry,
      token: "t",
      selfOrigin: "http://127.0.0.1:4517",
      initialOpenui: "spec version=1 bridge=astryx-react platform=react",
      specPath: join(root, "boyscout-spec.json"),
      openuiPath: join(root, "boyscout.openui"),
      projectRoot: root,
    });
    const res = await app.request("/api/commit", { method: "POST", headers: auth });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; violations: string[] };
    expect(body.ok).toBe(false);
    expect(body.violations.some((v: string) => v.includes("no features"))).toBe(true);
  });
});
