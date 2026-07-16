import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_INIT_OPTIONS, init, type InitOptions } from "../src/init.js";
import { main } from "../src/main.js";

const MAIN_SKILL = join(".claude", "skills", "boyscout", "SKILL.md");
const REFERENCE = join(".claude", "skills", "boyscout", "reference", "bridge-conventions.md");

function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), "bs-init-"));
}

function opts(over: Partial<InitOptions> = {}): InitOptions {
  return { ...DEFAULT_INIT_OPTIONS, ...over };
}

describe("boyscout init", () => {
  it("creates config, an empty seed spec, the main skill, and the bundled reference", () => {
    const dir = emptyProject();
    const result = init(dir, opts());

    expect(result.created).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      MAIN_SKILL,
      REFERENCE,
    ]);
    expect(result.skipped).toEqual([]);

    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.features).toEqual([]);
    expect(spec.metadata).toMatchObject({ bridge: "astryx-react", platform: "react" });
  });

  it("the main skill is the product skill; conventions are a bundled reference it points to", () => {
    const dir = emptyProject();
    init(dir, opts());

    const skill = readFileSync(join(dir, MAIN_SKILL), "utf8");
    expect(skill).toContain('name: "boyscout"');
    expect(skill).toContain("boyscout generate");
    expect(skill).toContain("reference/bridge-conventions.md");

    const reference = readFileSync(join(dir, REFERENCE), "utf8");
    expect(reference).toContain("### astryx-react");
  });

  it("angular stack selects the Material bridge in config and spec metadata", () => {
    const dir = emptyProject();
    init(dir, opts({ stack: "angular" }));

    const config = readFileSync(join(dir, "boyscout.config.yaml"), "utf8");
    expect(config).toContain("bridge: material");
    expect(config).toContain("platform: angular");

    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.metadata).toMatchObject({ bridge: "material", platform: "angular" });
  });

  it("honors an explicit capability subset", () => {
    const dir = emptyProject();
    init(dir, opts({ capabilities: ["component"] }));
    const config = readFileSync(join(dir, "boyscout.config.yaml"), "utf8");
    expect(config).toContain("  - component");
    expect(config).not.toContain("  - service");
  });

  it("cursor writes a single .mdc rule with conventions inlined; generic writes AGENTS.md", () => {
    const cursorDir = emptyProject();
    const cursor = init(cursorDir, opts({ agent: "cursor" }));
    expect(cursor.created).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      join(".cursor", "rules", "boyscout.mdc"),
    ]);
    const mdc = readFileSync(join(cursorDir, ".cursor", "rules", "boyscout.mdc"), "utf8");
    expect(mdc).toContain("## Bridge conventions");
    expect(mdc).toContain("### astryx-react");

    const genericDir = emptyProject();
    const generic = init(genericDir, opts({ agent: "generic" }));
    expect(generic.created).toContain("AGENTS.md");
    const agents = readFileSync(join(genericDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## boyscout");
    expect(agents).toContain("## Bridge conventions");
  });

  it("--example seeds the demo spec (React only)", () => {
    const dir = emptyProject();
    init(dir, opts({ example: true }));
    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.features.map((f: { id: string }) => f.id)).toEqual(["user-card", "user-service"]);
  });

  it("never overwrites an existing file (create-if-absent, D2b)", () => {
    const dir = emptyProject();
    writeFileSync(join(dir, "boyscout.config.yaml"), "platform: mine\n");

    const result = init(dir, opts());

    expect(result.skipped).toEqual(["boyscout.config.yaml"]);
    expect(result.created).toEqual(["boyscout-spec.json", MAIN_SKILL, REFERENCE]);
    expect(readFileSync(join(dir, "boyscout.config.yaml"), "utf8")).toBe("platform: mine\n");
  });

  it("is idempotent — a second run creates nothing", () => {
    const dir = emptyProject();
    init(dir, opts());
    const second = init(dir, opts());
    expect(second.created).toEqual([]);
    expect(second.skipped).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      MAIN_SKILL,
      REFERENCE,
    ]);
  });

  it("--example seeds a project that generates the logic-bearing seam", () => {
    const dir = emptyProject();
    init(dir, opts({ example: true }));
    const genArgs = [
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ];
    expect(main(genArgs)).toBe(0);

    const runningService = join(dir, ".running", "services", "UserService.ts");
    const durableService = join(dir, "src", "services", "user-service.ts");
    expect(existsSync(runningService)).toBe(true);
    expect(existsSync(durableService)).toBe(true);

    const sentinel = "// hand-authored logic — must survive regeneration\n";
    writeFileSync(durableService, sentinel);
    expect(main(genArgs)).toBe(0);
    expect(readFileSync(durableService, "utf8")).toBe(sentinel);
  });

  it("an empty default spec still generates (emits only the lock)", () => {
    const dir = emptyProject();
    init(dir, opts());
    const code = main([
      "generate",
      "--spec",
      join(dir, "boyscout-spec.json"),
      "--config",
      join(dir, "boyscout.config.yaml"),
    ]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, "boyscout.lock"))).toBe(true);
  });

  it("main routes the init command (non-TTY: defaults, no prompt) and exits 0", async () => {
    const dir = emptyProject();
    expect(await main(["init", "--root", dir])).toBe(0);
    expect(existsSync(join(dir, "boyscout.config.yaml"))).toBe(true);
    expect(existsSync(join(dir, MAIN_SKILL))).toBe(true);
  });
});
