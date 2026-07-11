import { describe, expect, it } from "vitest";
import { byteCompare, sortByBytes } from "../src/byte-order.js";

describe("byteCompare", () => {
  it("orders ascii by byte", () => {
    expect(byteCompare("a", "b")).toBe(-1);
    expect(byteCompare("b", "a")).toBe(1);
    expect(byteCompare("a", "a")).toBe(0);
  });
  it("treats a prefix as smaller", () => {
    expect(byteCompare("ab", "abc")).toBe(-1);
    expect(byteCompare("abc", "ab")).toBe(1);
  });
  it("orders by UTF-8 bytes, not UTF-16 units (astral vs BMP)", () => {
    // U+FE4F (﹏, 3 UTF-8 bytes, lead 0xEF) sorts before U+1F600 (😀, 4 bytes, lead 0xF0)
    expect(byteCompare("﹏", "\u{1F600}")).toBe(-1);
    // localeCompare / default sort would disagree via surrogate code units
  });
  it("is not localeCompare (case/diacritic independent, pure bytes)", () => {
    // 'Z' (0x5A) < 'a' (0x61) by byte; locale would often put 'a' first
    expect(byteCompare("Z", "a")).toBe(-1);
  });
});

describe("sortByBytes", () => {
  it("sorts keys by byte order and does not mutate input", () => {
    const input = [{ k: "b" }, { k: "a" }, { k: "Z" }];
    const out = sortByBytes(input, (x) => x.k);
    expect(out.map((x) => x.k)).toEqual(["Z", "a", "b"]);
    expect(input.map((x) => x.k)).toEqual(["b", "a", "Z"]);
  });
});
