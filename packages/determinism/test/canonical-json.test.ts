import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical-json.js";

describe("canonicalJson", () => {
  it("sorts object keys by byte order", () => {
    expect(canonicalJson({ b: 1, a: 2, Z: 3 })).toBe('{"Z":3,"a":2,"b":1}');
  });
  it("sorts nested keys recursively and emits no whitespace", () => {
    expect(canonicalJson({ x: { d: 1, c: 2 }, a: [3, { z: 1, y: 2 }] })).toBe(
      '{"a":[3,{"y":2,"z":1}],"x":{"c":2,"d":1}}',
    );
  });
  it("treats numeric-like keys as byte-sorted strings", () => {
    expect(canonicalJson({ 10: "a", 2: "b", 1: "c" })).toBe('{"1":"c","10":"a","2":"b"}');
  });
  it("omits undefined object properties", () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });
  it("normalizes -0 to 0", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson({ n: -0 })).toBe('{"n":0}');
  });
  it("serializes null, booleans, and strings", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson('a"b')).toBe('"a\\"b"');
  });
  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson(NaN)).toThrow();
    expect(() => canonicalJson(Infinity)).toThrow();
  });
  it("rejects undefined array elements and unsupported types", () => {
    expect(() => canonicalJson([undefined])).toThrow();
    expect(() => canonicalJson(10n)).toThrow();
  });
});
