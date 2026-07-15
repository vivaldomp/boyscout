import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultUiDist } from "../src/author/command.js";

describe("defaultUiDist", () => {
  it("falls back to the monorepo boyscout-ui build when no bundled ./ui exists", () => {
    // These tests run from src/author/, where ./ui never exists (build output lands in
    // dist/ui) — so the dev branch must win here whether or not the CLI has been built.
    const resolved = defaultUiDist();
    expect(resolved).toContain("boyscout-ui");
    expect(resolved.endsWith("dist")).toBe(true);
  });

  it("returns an absolute path", () => {
    expect(isAbsolute(defaultUiDist())).toBe(true);
  });
});
