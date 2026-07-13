import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { httpProvider } from "../src/http-provider.js";

function httpFeature(path: string, method: string): FeatureT {
  return {
    id: "api",
    capability: "http",
    tree: {
      type: "Http",
      props: { name: "Api" },
      children: [{ type: "Endpoint", props: { name: "getX", method, path, response: "unknown" } }],
    },
    annotations: {},
    props: {},
    approved: true,
  };
}

describe("http-provider string-literal escaping", () => {
  it("emits a clean path/method byte-identically to a hand-quoted literal", () => {
    const scaffold = httpProvider.generate(httpFeature("/users", "GET")).find((a) => !a.durable);
    expect(scaffold?.content).toContain('fetch("/users", { method: "GET" })');
  });

  it("escapes a quote/newline in path into a valid JS string literal (no raw breakout)", () => {
    const scaffold = httpProvider.generate(httpFeature('/a"b\nc', "GET")).find((a) => !a.durable);
    expect(scaffold?.content).toContain('fetch("/a\\"b\\nc"');
    expect(scaffold?.content).not.toContain('/a"b'); // the raw unescaped form must not appear
  });
});
