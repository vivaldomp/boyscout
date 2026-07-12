import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";

describe("cross-OS golden: fixture spec -> byte-identical component", () => {
  it("emits UserCard.tsx matching the committed golden bytes", () => {
    const config = loadConfig(readFileSync(here("./fixtures/config.yaml"), "utf8"));
    const specInput = JSON.parse(readFileSync(here("./fixtures/spec.json"), "utf8"));
    const assets = buildAssets({ specInput, config, bridge });

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset?.path).toBe("UserCard.tsx");

    const actualBytes = writeBytes(asset?.content ?? "");
    const goldenPath = here("./goldens/UserCard.tsx");

    if (UPDATE) {
      writeFileSync(goldenPath, actualBytes);
      return;
    }
    const expectedBytes = readFileSync(goldenPath);
    // Compare hashes of the canonical bytes — the determinism thesis, proven per-OS in CI.
    expect(hash(actualBytes)).toBe(hash(expectedBytes));
  });
});
