import { describe, expect, it } from "vitest";
import { registry } from "../src/index.js";

describe("astryx registry paramsFor", () => {
  it("returns ordered positional params per node type", () => {
    expect(registry.paramsFor("Heading")).toEqual(["level", "text"]);
    expect(registry.paramsFor("Text")).toEqual(["type", "text"]);
    expect(registry.paramsFor("Button")).toEqual(["variant", "text"]);
    expect(registry.paramsFor("VStack")).toEqual(["gap"]);
    expect(registry.paramsFor("Card")).toEqual([]);
    expect(registry.paramsFor("Method")).toEqual(["name", "params", "returns"]);
    expect(registry.paramsFor("Endpoint")).toEqual(["name", "method", "path", "response"]);
  });
  it("returns [] for an unknown node type", () => {
    expect(registry.paramsFor("Nope")).toEqual([]);
  });
});
