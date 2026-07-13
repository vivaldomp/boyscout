import { describe, expect, it } from "vitest";
import { makeClient, readToken } from "../src/api.js";
import { makeClient as makeClient2 } from "../src/api.js";

describe("api client", () => {
  it("reads the token from the URL fragment", () => {
    expect(readToken("#t=abc123")).toBe("abc123");
    expect(readToken("")).toBe("");
  });

  it("sends the Bearer token on every call", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = makeClient("tok", fakeFetch);
    await client.parse("some text");
    expect(calls[0]?.url).toContain("/api/parse");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok");
  });
});

describe("api client — guided", () => {
  it("annotate posts featureId/path/note", async () => {
    const calls: { url: string; body: string }[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response(JSON.stringify({ annotations: { "0": "n" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const client = makeClient2("tok", fakeFetch);
    const r = await client.annotate("card", "0", "n");
    expect(r.annotations).toEqual({ "0": "n" });
    expect(calls[0]?.url).toContain("/api/annotate");
    expect(JSON.parse(calls[0]!.body)).toEqual({ featureId: "card", path: "0", note: "n" });
  });

  it("questionnaire returns null on a 404", async () => {
    const fakeFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await makeClient2("tok", fakeFetch).questionnaire()).toBeNull();
  });
});
