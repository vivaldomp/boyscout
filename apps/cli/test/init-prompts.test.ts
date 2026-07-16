import { describe, expect, it } from "vitest";
import { resolveInitOptions } from "../src/init-prompts.js";

describe("resolveInitOptions", () => {
  it("returns defaults when nothing is set and there is no TTY (never blocks on stdin)", async () => {
    const o = await resolveInitOptions({}, { isTty: false });
    expect(o).toEqual({
      stack: "react",
      agent: "claude",
      scope: "local",
      capabilities: [],
      example: false,
    });
  });

  it("reads parsed flags without prompting", async () => {
    const o = await resolveInitOptions(
      {
        stack: "angular",
        agent: "cursor",
        scope: "global",
        capabilities: "component,http",
        example: true,
      },
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

  it("--yes on a TTY takes defaults without prompting (never opens stdin)", async () => {
    const o = await resolveInitOptions({ yes: true }, { isTty: true });
    expect(o.stack).toBe("react");
    expect(o.agent).toBe("claude");
  });
});
