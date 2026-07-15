import type { Bridge } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

const frag = { conventions: "c", imports: "i", tokens: "t", architecture: "a", naming: "n" };
const mk = (id: string): Bridge => ({
  id,
  platform: "p",
  version: "0.0.0",
  registry: {} as never,
  postRules: [],
  skill: frag,
});

describe("composeSkill escaping", () => {
  it("YAML-escapes newline/quote in meta so frontmatter stays single-key", () => {
    const md = composeSkill([mk("x")], { name: 'a"\nname: injected', description: "d" });
    const front = md.slice(0, md.indexOf("\n---"));
    // exactly one top-level `name:` line inside the frontmatter block
    expect(front.match(/^name:/gm)?.length).toBe(1);
    expect(front).not.toContain("\nname: injected");
  });

  it("strips newline/heading chars from bridge id headings", () => {
    const md = composeSkill([mk("x\n## Injected")], { name: "n", description: "d" });
    expect(md).not.toContain("\n## Injected");
  });
});
