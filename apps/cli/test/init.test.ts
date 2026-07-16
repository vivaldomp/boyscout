import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_INIT_OPTIONS, init, type InitOptions } from "../src/init.js";
import { main } from "../src/main.js";

const CONVENTIONS = join(".claude", "skills", "boyscout", "SKILL.md");
const WORKFLOW = join(".claude", "skills", "boyscout-workflow", "SKILL.md");

function emptyProject(): string {
  return mkdtempSync(join(tmpdir(), "bs-init-"));
}

function opts(over: Partial<InitOptions> = {}): InitOptions {
  return { ...DEFAULT_INIT_OPTIONS, ...over };
}

describe("boyscout init", () => {
  it("creates config, an empty seed spec, and both Claude Code skills by default", () => {
    const dir = emptyProject();
    const result = init(dir, opts());

    expect(result.created).toEqual([
      "boyscout.config.yaml",
      "boyscout-spec.json",
      CONVENTIONS,
      WORKFLOW,
    ]);
    expect(result.skipped).toEqual([]);

    const spec = JSON.parse(readFileSync(join(dir, "boyscout-spec.json"), "utf8"));
    expect(spec.features).toEqual([]);
    expect(spec.metadata).toMatchObject({ bridge: "astryx-react", platform: "react" });
  });

  it("composes the bridge conventions and a CLI-workflow skill", () => {
    const dir = emptyProject();
    init(dir, opts());

    const conventions = readFileSync(join(dir, CONVENTIONS), "utf8");
    expect(conventions).toContain('name: "boyscout"');
    expect(conventions).toContain("### astryx-react");

    const workflow = readFileSync(join(dir, WORKFLOW), "utf8");
    expect(workflow).toContain('name: "boyscout-workflow"');
    expect(workflow).toContain("boyscout generate");
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

  it("cursor agent writes .mdc rules; generic writes AGENTS.md", () => {
    const cursorDir = emptyProject();
    const cursor = init(cursorDir, opts({ agent: "cursor" }));
    expect(cursor.created).toContain(join(".cursor", "rules", "boyscout.mdc"));
    expect(cursor.created).toContain(join(".cursor", "rules", "boyscout-workflow.mdc"));

    const genericDir = emptyProject();
    const generic = init(genericDir, opts({ agent: "generic" }));
    expect(generic.created).toContain("AGENTS.md");
    const agents = readFileSync(join(genericDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("## boyscout");
    expect(agents).toContain("## boyscout-workflow");
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
    expect(result.created).toEqual(["boyscout-spec.json", CONVENTIONS, WORKFLOW]);
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
      CONVENTIONS,
      WORKFLOW,
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

    // The durable file is created-if-absent (D2b): regeneration must never overwrite it.
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
    expect(existsSync(join(dir, CONVENTIONS))).toBe(true);
  });
});
