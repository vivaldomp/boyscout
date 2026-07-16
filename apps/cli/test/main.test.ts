import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

function project(specTree: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "boyscout-cli-"));
  writeFileSync(
    join(dir, "boyscout.config.yaml"),
    "platform: react\nbridge: astryx-react\ncapabilities:\n  - component\n",
  );
  writeFileSync(
    join(dir, "boyscout-spec.json"),
    JSON.stringify({
      version: "1",
      features: [
        {
          id: "user-card",
          capability: "component",
          tree: specTree,
          annotations: {},
          props: {},
          approved: true,
        },
      ],
      metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
    }),
  );
  return dir;
}

describe("boyscout generate (main)", () => {
  it("returns 0 and emits .running output for a valid spec", () => {
    const dir = project({
      type: "Card",
      children: [{ type: "Text", props: { type: "body", text: "hi" } }],
    });
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, ".running", "UserCard.tsx"))).toBe(true);
  });

  it("returns 1 on a guardrail 422 (unknown component)", () => {
    const dir = project({ type: "Blob" });
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(1);
  });

  it("returns 1 for an unknown command", async () => {
    expect(await main(["frobnicate"])).toBe(1);
  });

  it("returns 1 when an init enum flag is not an allowed choice", async () => {
    const dir = mkdtempSync(join(tmpdir(), "boyscout-cli-"));
    expect(await main(["init", "--root", dir, "--stack", "svelte"])).toBe(1);
  });
});
