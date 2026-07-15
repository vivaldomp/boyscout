import { bridge as astryx } from "@boyscout/bridge-astryx-react";
import { bridge as material } from "@boyscout/bridge-material";
import { writeBytes } from "@boyscout/determinism";
import { describe, expect, it } from "vitest";
import { composeSkill } from "../src/index.js";

describe("composeSkill over the real bridges", () => {
  const meta = { name: "boyscout", description: "governed deterministic generation" };

  it("renders both bridge ids and every section heading", () => {
    const md = composeSkill([astryx, material], meta);
    for (const heading of [
      "## Conventions",
      "## Imports",
      "## Tokens",
      "## Architecture",
      "## Naming",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("### astryx-react");
    expect(md).toContain("### material");
  });

  it("is byte-stable and canonical", () => {
    const md = composeSkill([material, astryx], meta);
    expect(md).toBe(composeSkill([astryx, material], meta));
    expect(md).toBe(new TextDecoder().decode(writeBytes(md)));
  });
});
