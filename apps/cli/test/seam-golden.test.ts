import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, generate, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const config = loadConfig(readFileSync(here("./fixtures/seam-config.yaml"), "utf8"));
const specInput = JSON.parse(readFileSync(here("./fixtures/seam-spec.json"), "utf8"));

describe("cross-OS golden: logic-bearing scaffolds are byte-identical (scaffold only, D2b)", () => {
  it("every .running scaffold matches its committed golden; durables are excluded", () => {
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);
    const durables = assets.filter((a) => a.durable);

    // Three logic-bearing features -> three scaffolds + three durable stubs.
    expect(scaffolds).toHaveLength(3);
    expect(durables).toHaveLength(3);

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/seam/${asset.path}`);
      const actualBytes = writeBytes(asset.content);
      if (UPDATE) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, actualBytes);
        continue;
      }
      expect(existsSync(goldenPath), `missing golden for ${asset.path}`).toBe(true);
      expect(hash(actualBytes), `byte drift in ${asset.path}`).toBe(hash(readFileSync(goldenPath)));
    }
  });
});

describe("durable seam: regen preserves the human file (D2b)", () => {
  it("creates the src stub, then leaves it untouched on a second generate; re-emits the scaffold", () => {
    const outDir = mkdtempSync(join(tmpdir(), "seam-e2e-"));
    const first = generate({ specInput, config, bridge, outDir });
    const stubPath = join(outDir, "src", "services/user-service.ts");
    const scaffoldPath = join(outDir, ".running", "services/UserService.ts");
    expect(existsSync(stubPath)).toBe(true);
    expect(first.emitted).toContain(stubPath);

    const humanEdit =
      "export const userService = {\n  async getUsers() {\n    return ['real'];\n  },\n};\n";
    writeFileSync(stubPath, humanEdit);
    const scaffoldBefore = readFileSync(scaffoldPath, "utf8");

    const second = generate({ specInput, config, bridge, outDir });
    expect(readFileSync(stubPath, "utf8")).toBe(humanEdit); // preserved
    expect(second.preserved).toContain(stubPath);
    expect(second.emitted).not.toContain(stubPath); // not re-created
    expect(readFileSync(scaffoldPath, "utf8")).toBe(scaffoldBefore); // scaffold re-emitted identical
  });
});
