import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emit } from "../src/index.js";

describe("emit — durable create-if-absent (D2b)", () => {
  it("writes scaffolds to .running (overwrite) and durables to src (create-if-absent)", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    const r = emit(
      [
        { path: "services/X.ts", content: "export const scaffold = 1;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    expect(r.scaffolds).toHaveLength(1);
    expect(r.durablesCreated).toHaveLength(1);
    expect(existsSync(join(outDir, ".running", "services/X.ts"))).toBe(true);
    expect(existsSync(join(outDir, "src", "services/x.ts"))).toBe(true);
  });

  it("preserves an existing durable file on re-emit; re-writes the scaffold", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    emit(
      [
        { path: "services/X.ts", content: "export const v = 1;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    const humanPath = join(outDir, "src", "services/x.ts");
    writeFileSync(humanPath, "export const stub = 'HUMAN';\n");
    const r = emit(
      [
        { path: "services/X.ts", content: "export const v = 2;\n" },
        { path: "services/x.ts", content: "export const stub = 1;\n", durable: true },
      ],
      outDir,
    );
    expect(r.durablesPreserved).toHaveLength(1);
    expect(r.durablesCreated).toHaveLength(0);
    expect(readFileSync(humanPath, "utf8")).toBe("export const stub = 'HUMAN';\n");
    expect(readFileSync(join(outDir, ".running", "services/X.ts"), "utf8")).toContain("v = 2");
  });

  it("rejects a durable path that escapes src", () => {
    const outDir = mkdtempSync(join(tmpdir(), "durable-"));
    expect(() => emit([{ path: "../evil.ts", content: "x", durable: true }], outDir)).toThrow(
      /traversal|\.\./,
    );
  });
});
