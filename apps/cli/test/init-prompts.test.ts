import { describe, expect, it } from "vitest";
import { resolveInitOptions } from "../src/init-prompts.js";

describe("resolveInitOptions", () => {
  it("returns defaults when no flags and no TTY (never blocks on stdin)", async () => {
    const o = await resolveInitOptions([], { isTty: false });
    expect(o).toEqual({
      stack: "react",
      agent: "claude",
      scope: "local",
      capabilities: [],
      example: false,
    });
  });

  it("reads flags without prompting", async () => {
    const o = await resolveInitOptions(
      [
        "--stack",
        "angular",
        "--agent",
        "cursor",
        "--scope",
        "global",
        "--capabilities",
        "component,http",
        "--example",
      ],
      { isTty: false },
    );
    expect(o).toEqual({
      stack: "angular",
      agent: "cursor",
      scope: "global",
      capabilities: ["component", "http"],
      example: true,
    });
  });

  it("rejects an invalid enum flag", async () => {
    await expect(resolveInitOptions(["--stack", "svelte"], { isTty: false })).rejects.toThrow(
      /invalid --stack/,
    );
  });

  it("--yes on a TTY takes defaults without prompting (never opens stdin)", async () => {
    const o = await resolveInitOptions(["--yes"], { isTty: true });
    expect(o.stack).toBe("react");
    expect(o.agent).toBe("claude");
  });
});
