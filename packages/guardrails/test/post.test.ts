import type { Asset, AssetRule } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { biomeLint, checkAssets } from "../src/index.js";

const clean: Asset = {
  path: "Ok.tsx",
  content: 'export function Ok() {\n  return <span>hi</span>;\n}\n',
};

describe("checkAssets (post-barrier engine)", () => {
  it("passes when no rule reports a violation", () => {
    const noop: AssetRule = () => [];
    expect(checkAssets([clean], [noop])).toEqual({ ok: true, violations: [], code: 200 });
  });

  it("fails with 422 when a rule reports a violation", () => {
    const always: AssetRule = (a) => [`${a.path}: nope`];
    const r = checkAssets([clean], [always]);
    expect(r.ok).toBe(false);
    expect(r.code).toBe(422);
  });
});

describe("biomeLint rule", () => {
  it("passes clean code (no error/fatal diagnostics)", () => {
    expect(biomeLint(clean)).toEqual([]);
  });

  it("flags code with a lint error", () => {
    // `== null` style aside, a redeclared const is a hard parse/lint error.
    const broken: Asset = { path: "Bad.ts", content: "const x = 1;\nconst x = 2;\n" };
    expect(biomeLint(broken).length).toBeGreaterThan(0);
  });
});
