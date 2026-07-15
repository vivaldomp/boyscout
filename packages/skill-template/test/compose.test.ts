import { writeBytes } from "@boyscout/determinism";
import type { Bridge, BridgeSkill } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

const emptyRegistry = {
  capabilities: [] as const,
  nodeTypesFor: () => [],
  paramsFor: () => [],
  providerFor: () => undefined,
};

function stubBridge(id: string, skill?: BridgeSkill): Bridge {
  return {
    id,
    platform: "test",
    registry: emptyRegistry,
    postRules: [],
    ...(skill ? { skill } : {}),
  };
}

const fullSkill = (tag: string): BridgeSkill => ({
  conventions: `${tag} conventions`,
  imports: `${tag} imports`,
  tokens: `${tag} tokens`,
  architecture: `${tag} architecture`,
  naming: `${tag} naming`,
});

describe("composeSkill", () => {
  it("emits agentskills.io frontmatter", () => {
    const md = composeSkill([stubBridge("a", fullSkill("A"))], {
      name: "boyscout",
      description: "governed generation",
    });
    expect(md.startsWith("---\nname: boyscout\ndescription: governed generation\n---")).toBe(true);
  });

  it("renders sections in fixed order", () => {
    const md = composeSkill([stubBridge("a", fullSkill("A"))], { name: "s", description: "d" });
    const order = ["## Conventions", "## Imports", "## Tokens", "## Architecture", "## Naming"].map(
      (h) => md.indexOf(h),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("groups bridges under each section, sorted by id", () => {
    const md = composeSkill(
      [stubBridge("zed", fullSkill("Z")), stubBridge("abe", fullSkill("A"))],
      {
        name: "s",
        description: "d",
      },
    );
    const conv = md.slice(md.indexOf("## Conventions"), md.indexOf("## Imports"));
    expect(conv).toContain("### abe");
    expect(conv).toContain("### zed");
    expect(conv.indexOf("### abe")).toBeLessThan(conv.indexOf("### zed"));
  });

  it("is byte-identical regardless of input order and already canonical", () => {
    const a = stubBridge("abe", fullSkill("A"));
    const z = stubBridge("zed", fullSkill("Z"));
    const md1 = composeSkill([a, z], { name: "s", description: "d" });
    const md2 = composeSkill([z, a], { name: "s", description: "d" });
    expect(md1).toBe(md2);
    expect(md1).toBe(new TextDecoder().decode(writeBytes(md1)));
    expect(md1.endsWith("\n")).toBe(true);
    expect(md1.endsWith("\n\n")).toBe(false);
  });

  it("skips absent or empty sections without blank headings", () => {
    const partial: BridgeSkill = {
      conventions: "only conv",
      imports: "",
      tokens: "  ",
      architecture: "",
      naming: "",
    };
    const md = composeSkill([stubBridge("a", partial), stubBridge("b")], {
      name: "s",
      description: "d",
    });
    expect(md).toContain("## Conventions");
    expect(md).toContain("### a\nonly conv");
    expect(md).not.toContain("## Imports");
    expect(md).not.toContain("## Tokens");
    expect(md).not.toContain("## Naming");
    expect(md).not.toContain("### b");
  });
});
