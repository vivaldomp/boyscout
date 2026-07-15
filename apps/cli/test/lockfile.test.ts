import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

// Reuse the existing committed astryx spec+config fixtures (proven to generate by main.test.ts).
const specFixture = readFileSync(new URL("./fixtures/spec.json", import.meta.url), "utf8");
const configFixture = readFileSync(new URL("./fixtures/config.yaml", import.meta.url), "utf8");

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "bs-lock-"));
  writeFileSync(join(dir, "spec.json"), specFixture);
  writeFileSync(join(dir, "config.yaml"), configFixture);
  return dir;
}

describe("generate writes and verifies boyscout.lock", () => {
  it("writes boyscout.lock on generate", () => {
    const dir = project();
    const code = main([
      "generate",
      "--spec",
      join(dir, "spec.json"),
      "--config",
      join(dir, "config.yaml"),
    ]);
    expect(code).toBe(0);
    expect(existsSync(join(dir, "boyscout.lock"))).toBe(true);
  });

  it("--check passes against a fresh lock", () => {
    const dir = project();
    const args = [
      "generate",
      "--spec",
      join(dir, "spec.json"),
      "--config",
      join(dir, "config.yaml"),
    ];
    expect(main(args)).toBe(0);
    expect(main([...args, "--check"])).toBe(0);
  });

  it("--check fails (exit 1) when the lock has drifted", () => {
    const dir = project();
    const args = [
      "generate",
      "--spec",
      join(dir, "spec.json"),
      "--config",
      join(dir, "config.yaml"),
    ];
    expect(main(args)).toBe(0);
    // Corrupt the on-disk lock to simulate drift.
    const lockPath = join(dir, "boyscout.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.bridge.version = "9.9.9";
    writeFileSync(lockPath, `${JSON.stringify(lock)}\n`);
    expect(main([...args, "--check"])).toBe(1);
  });
});
