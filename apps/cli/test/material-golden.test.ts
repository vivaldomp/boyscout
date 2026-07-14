import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-material";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: material scaffolds are byte-identical (scaffold only)", () => {
  it("every .running scaffold matches its committed golden; durables excluded", () => {
    const config = loadConfig(readFileSync(here("./fixtures/material-config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/material-spec.json"), "utf8"));
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);

    // 4 features -> component + form + route + http scaffold = 4 scaffolds (+ 1 durable http stub).
    expect(scaffolds).toHaveLength(4);

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/material/${asset.path}`);
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
