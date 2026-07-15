import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const specFixture = readFileSync(new URL("./fixtures/spec.json", import.meta.url), "utf8");
const configFixture = readFileSync(new URL("./fixtures/config.yaml", import.meta.url), "utf8");

describe("boyscout.lock records the CLI's own version", () => {
  it("runtimeVersion equals the CLI package.json version", () => {
    const dir = mkdtempSync(join(tmpdir(), "bs-ver-"));
    writeFileSync(join(dir, "spec.json"), specFixture);
    writeFileSync(join(dir, "config.yaml"), configFixture);

    const code = main([
      "generate",
      "--spec",
      join(dir, "spec.json"),
      "--config",
      join(dir, "config.yaml"),
    ]);
    expect(code).toBe(0);

    const lock = JSON.parse(readFileSync(join(dir, "boyscout.lock"), "utf8")) as {
      runtimeVersion: string;
    };
    expect(lock.runtimeVersion).toBe(pkg.version);
  });
});
