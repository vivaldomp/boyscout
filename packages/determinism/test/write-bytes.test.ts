import { describe, expect, it } from "vitest";
import { writeBytes } from "../src/write-bytes.js";

const dec = new TextDecoder();

describe("writeBytes", () => {
  it("normalizes CRLF and CR to LF", () => {
    expect(dec.decode(writeBytes("a\r\nb\rc"))).toBe("a\nb\nc\n");
  });
  it("ensures exactly one trailing newline", () => {
    expect(dec.decode(writeBytes("x"))).toBe("x\n");
    expect(dec.decode(writeBytes("x\n"))).toBe("x\n");
  });
  it("strips a leading UTF-8 BOM and never emits one", () => {
    const out = writeBytes("﻿hello");
    expect(out[0]).not.toBe(0xef); // no BOM bytes at start
    expect(dec.decode(out)).toBe("hello\n");
  });
  it("encodes UTF-8", () => {
    expect(Array.from(writeBytes("é"))).toEqual([0xc3, 0xa9, 0x0a]);
  });
});
