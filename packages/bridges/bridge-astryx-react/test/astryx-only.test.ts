import type { Asset } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { astryxOnly } from "../src/astryx-only.js";

describe("astryxOnly (post-barrier design-system rule)", () => {
  it("passes JSX using only Astryx (capitalized) components", () => {
    const ok: Asset = { path: "Ok.tsx", content: "export const A = () => <Card><Text>x</Text></Card>;" };
    expect(astryxOnly(ok)).toEqual([]);
  });

  it("flags a bare intrinsic element (<div>)", () => {
    const bad: Asset = { path: "Bad.tsx", content: "export const A = () => <div>x</div>;" };
    const v = astryxOnly(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toContain("div");
  });
});
