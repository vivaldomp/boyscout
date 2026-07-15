import { bridge } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";

describe("bridge-astryx-react version", () => {
  it("exposes a non-empty semver-ish version string", () => {
    expect(bridge.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
