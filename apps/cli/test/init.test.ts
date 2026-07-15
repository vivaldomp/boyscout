import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { init } from "../src/init.js";
import { main } from "../src/main.js";

const SKILL = join(".claude", "skills", "boyscout", "SKILL.md");

function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), "bs-init-"));
}

describe("boyscout init", () => {
  it("creates config, seed spec, and the Claude Code skill", () => {
    const dir = emptyProject();
    const result = init(dir);

    expect(result.created).toEqual(["boyscout.config.yaml", "boyscout-spec.json", SKILL]);
    expect(result.skipped).toEqual([]);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
    expect(existsSync(join(dir, "boyscout-spec.json"))).toBe(true);
    expect(existsSync(join(dir, SKILL))).toBe(true);
  });

  it("composes the Astryx bridge's knowledge into SKILL.md", () => {
    const dir = emptyProject();
    init(dir);
    const skill = readFileSync(join(dir, SKILL), "utf8");
    expect(skill).toContain('name: "boyscout"');
    expect(skill).toContain("### astryx-react");
  });

  it("never overwrites an existing file (create-if-absent, D2b)", () => {
    const dir = emptyProject();
    writeFileSync(join(dir, "boyscout.config.yaml"), "platform: mine\n");

    const result = init(dir);

    expect(result.skipped).toEqual(["boyscout.config.yaml"]);
    expect(result.created).toEqual(["boyscout-spec.json", SKILL]);
    expect(readFileSync(join(dir, "boyscout.config.yaml"), "utf8")).toBe("platform: mine\n");
  });

  it("is idempotent — a second run creates nothing", () => {
    const dir = emptyProject();
    init(dir);
    const second = init(dir);
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual(["boyscout.config.yaml", "boyscout-spec.json", SKILL]);
  });

  it("seeds a project that actually generates", () => {
    const dir = emptyProject();
    init(dir);
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(0);
  });

  it("main routes the init command and exits 0", () => {
    const dir = emptyProject();
    expect(main(["init", "--root", dir])).toBe(0);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
  });
});
