import { describe, expect, it } from "vitest";
import { format } from "../src/format.js";

describe("format", () => {
  it("formats messy TS to the pinned canonical style", () => {
    const out = format("const  x=1 ;function  f( a,b ){return a==b}", "ts");
    expect(out).toContain("const x = 1;");
    expect(out).toContain("function f(a, b)");
  });
  it("is idempotent: format(format(x)) === format(x)", () => {
    const once = format("const x=1", "ts");
    expect(format(once, "ts")).toBe(once);
  });
  it("formats JSON", () => {
    expect(format('{"b":1,"a":2}', "json")).toContain('"b": 1');
  });
});
