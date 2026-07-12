import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("agnosticism invariant (§14.1)", () => {
  it("the runtime package declares no bridge or framework dependency", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    const leaks = deps.filter((d) => d.includes("astryx") || d.includes("bridge-"));
    expect(leaks, `runtime must not depend on a bridge/framework: ${leaks.join(", ")}`).toEqual([]);
  });
});
