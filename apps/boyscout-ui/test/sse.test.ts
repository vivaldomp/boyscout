import { describe, expect, it } from "vitest";
import { parseFrame, postSse, type SseEvent } from "../src/sse.js";

describe("parseFrame", () => {
  it("extracts event + data, defaults event to message", () => {
    expect(parseFrame("event: feature\ndata: {\"id\":\"a\"}")).toEqual({ event: "feature", data: '{"id":"a"}' });
    expect(parseFrame("data: hi")).toEqual({ event: "message", data: "hi" });
    expect(parseFrame(": comment only")).toBeNull();
  });
});

describe("postSse", () => {
  it("streams frames from the response body to onEvent", async () => {
    const body = "event: feature\ndata: 1\n\nevent: done\ndata: {\"ok\":true}\n\n";
    const fakeFetch = (async () =>
      new Response(new ReadableStream({
        start(ctrl) { ctrl.enqueue(new TextEncoder().encode(body)); ctrl.close(); },
      }), { headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch;

    const events: SseEvent[] = [];
    await postSse("/api/compose", { answers: {} }, {}, (e) => events.push(e), fakeFetch);
    expect(events).toEqual([
      { event: "feature", data: "1" },
      { event: "done", data: '{"ok":true}' },
    ]);
  });
});
