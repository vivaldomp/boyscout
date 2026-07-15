import { describe, expect, it } from "vitest";
import { defaultAuthToken, resolveHost } from "../src/author/command.js";

describe("§21 CSPRNG session token", () => {
  it("default token is 48 lowercase-hex chars (randomBytes(24))", () => {
    const a = defaultAuthToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(defaultAuthToken()).not.toBe(a); // fresh entropy each call
  });
});

describe("§21 loopback-default bind", () => {
  it("defaults to 127.0.0.1 with no --host flag", () => {
    expect(resolveHost([])).toBe("127.0.0.1");
  });

  it("honors an explicit --host override (e.g. 0.0.0.0)", () => {
    expect(resolveHost(["--host", "0.0.0.0"])).toBe("0.0.0.0");
  });
});
