import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("contract kit is bridge-agnostic", () => {
  it("the kit source imports no concrete bridge", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
    expect(src).not.toMatch(/astryx|bridge-material|bridge-astryx/);
  });

  it("the kit package declares no bridge dependency", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string> };
    const leaks = Object.keys(pkg.dependencies ?? {}).filter((d) => d.includes("bridge"));
    expect(leaks).toEqual([]);
  });
});
