import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: E2E seed astryx scaffolds are byte-identical", () => {
  it("every .running scaffold matches its committed golden; durables excluded", () => {
    const config = loadConfig(readFileSync(here("./fixtures/dialect-config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/astryx-seed-spec.json"), "utf8"));
    const scaffolds = buildAssets({ specInput, config, bridge }).filter((a) => !a.durable);

    expect(scaffolds.length).toBeGreaterThan(0);
    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/astryx-seed/${asset.path}`);
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
