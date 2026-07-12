import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bridge, registry } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui, serializeOpenui } from "@boyscout/dialect";
import { buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const openuiText = readFileSync(here("./fixtures/dialect.openui"), "utf8");
const config = loadConfig(readFileSync(here("./fixtures/dialect-config.yaml"), "utf8"));

describe("SP4a E2E: authored .openui drives the engine", () => {
  it("parses to a spec that generates byte-identical scaffolds (escaping proven)", () => {
    const specInput = parseOpenui(openuiText, registry);
    const assets = buildAssets({ specInput, config, bridge });
    const scaffolds = assets.filter((a) => !a.durable);
    expect(scaffolds).toHaveLength(2); // user-card + escape-demo

    for (const asset of scaffolds) {
      const goldenPath = here(`./goldens/dialect/${asset.path}`);
      const bytes = writeBytes(asset.content);
      if (UPDATE) {
        mkdirSync(dirname(goldenPath), { recursive: true });
        writeFileSync(goldenPath, bytes);
        continue;
      }
      expect(existsSync(goldenPath), `missing golden for ${asset.path}`).toBe(true);
      expect(hash(bytes), `byte drift in ${asset.path}`).toBe(hash(readFileSync(goldenPath)));
    }
  });

  it("escaped the untrusted text into valid JSX entities (no raw < or { in output)", () => {
    const specInput = parseOpenui(openuiText, registry);
    const assets = buildAssets({ specInput, config, bridge });
    const demo = assets.find((a) => a.path === "EscapeDemo.tsx");
    expect(demo).toBeDefined();
    expect(demo?.content).toContain("Tom &quot;TJ&quot; &lt;j&gt; &#123;x&#125; &amp; co");
  });

  it("round-trips through the REAL astryx registry (parse . serialize is a fixed point)", () => {
    const spec = parseOpenui(openuiText, registry);
    const text = serializeOpenui(spec, registry);
    expect(serializeOpenui(parseOpenui(text, registry), registry)).toBe(text);
    expect(parseOpenui(serializeOpenui(spec, registry), registry)).toEqual(spec);
  });
});
