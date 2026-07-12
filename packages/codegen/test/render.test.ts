import { describe, expect, it } from "vitest";
import { render } from "../src/index.js";

describe("render", () => {
  it("interpolates data via the `it` variable", () => {
    expect(render("Hi <%= it.name %>", { name: "Ada" })).toBe("Hi Ada");
  });

  it("does not HTML-escape (autoEscape off)", () => {
    expect(render("<%= it.jsx %>", { jsx: "<Card>&</Card>" })).toBe("<Card>&</Card>");
  });

  it("is deterministic for identical inputs", () => {
    const t = "a<%= it.x %>b";
    expect(render(t, { x: "1" })).toBe(render(t, { x: "1" }));
  });
});
