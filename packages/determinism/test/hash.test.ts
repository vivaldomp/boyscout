import { describe, expect, it } from "vitest";
import { hash } from "../src/hash.js";

describe("hash", () => {
  it("is SHA-256 hex of the input bytes (known vector for empty input)", () => {
    expect(hash(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
  it('matches the known vector for "abc"', () => {
    expect(hash(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("is stable across calls", () => {
    const b = new TextEncoder().encode("boyscout");
    expect(hash(b)).toBe(hash(b));
  });
});
