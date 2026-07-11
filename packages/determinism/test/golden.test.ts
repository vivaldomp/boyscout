import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson, format, hash, writeBytes } from "../src/index.js";

const UPDATE = process.env.UPDATE_GOLDENS === "1";
const goldenPath = (name: string) => fileURLToPath(new URL(`../goldens/${name}`, import.meta.url));

/** Assert `actual` bytes equal the committed golden; with UPDATE_GOLDENS=1, (re)write it. */
function assertGolden(name: string, actual: Uint8Array): void {
  const path = goldenPath(name);
  if (UPDATE) {
    writeFileSync(path, actual);
    return;
  }
  const expected = new Uint8Array(readFileSync(path));
  // Compare via hash so a mismatch failure message stays small and OS-independent.
  expect(hash(actual)).toBe(hash(expected));
}

const CANONICAL_FIXTURE = {
  z: 1,
  a: { d: [3, 2, 1], c: "café" },
  "10": true,
  "2": null,
  unicode: "😀﹏",
};

const TS_FIXTURE = "const  x=1 ;function  f( a,b ){return a==b}\n";

describe("golden (cross-OS byte identity)", () => {
  it("canonicalJson golden", () => {
    assertGolden("canonical-json.json", writeBytes(canonicalJson(CANONICAL_FIXTURE)));
  });
  it("writeBytes golden (CRLF input normalized)", () => {
    assertGolden("write-bytes.txt", writeBytes("line1\r\nline2\rline3"));
  });
  it("format golden (TS)", () => {
    assertGolden("format-ts.txt", writeBytes(format(TS_FIXTURE, "ts")));
  });
});
