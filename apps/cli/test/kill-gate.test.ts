import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { astryxOnly, bridge } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { checkAssets } from "@boyscout/guardrails";
import { GateError, buildAssets, loadConfig } from "@boyscout/runtime";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const config = loadConfig(readFileSync(here("./fixtures/config.yaml"), "utf8"));
const validSpec = JSON.parse(readFileSync(here("./fixtures/spec.json"), "utf8"));

describe("kill-gate: headless governance (both barriers)", () => {
  it("pre-barrier: an unknown component 422s at validate()", () => {
    const bad = structuredClone(validSpec);
    bad.features[0].tree = { type: "Blob" };
    try {
      buildAssets({ specInput: bad, config, bridge });
      expect.unreachable("should have thrown at the pre-barrier");
    } catch (e) {
      expect(e).toBeInstanceOf(GateError);
      expect((e as GateError).violations.some((v) => v.includes("Blob"))).toBe(true);
    }
  });

  it("post-barrier: a violating asset 422s at verify()", () => {
    const violating = {
      path: "Bad.tsx",
      content: "export const Bad = () => <div>escaped</div>;\n",
    };
    const result = checkAssets([violating], bridge.postRules);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(422);
    expect(astryxOnly(violating).length).toBeGreaterThan(0);
  });

  it("determinism: the same fixture builds byte-identical output twice", () => {
    const once = buildAssets({ specInput: validSpec, config, bridge });
    const twice = buildAssets({ specInput: validSpec, config, bridge });
    expect(hash(writeBytes(once[0]?.content ?? ""))).toBe(
      hash(writeBytes(twice[0]?.content ?? "")),
    );
  });
});
