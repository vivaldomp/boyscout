import { Biome } from "@biomejs/js-api/nodejs";
import type { ProjectKey } from "@biomejs/wasm-nodejs";
import type { Asset, AssetRule } from "@boyscout/schemas";

// Explicit in-memory config — hermetic, no ambient biome.json is ever read.
const CONFIG = {
  linter: { enabled: true, rules: { recommended: true } },
} as const;

let cached: { biome: Biome; projectKey: ProjectKey } | null = null;

function instance(): { biome: Biome; projectKey: ProjectKey } {
  if (cached) return cached;
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  biome.applyConfiguration(projectKey, CONFIG);
  cached = { biome, projectKey };
  return cached;
}

/** Post-barrier rule: lint an asset with the pinned Biome; report error/fatal diagnostics as violations. */
export const biomeLint: AssetRule = (asset: Asset): string[] => {
  const { biome, projectKey } = instance();
  const { diagnostics } = biome.lintContent(projectKey, asset.content, { filePath: asset.path });
  return diagnostics
    .filter((d) => d.severity === "error" || d.severity === "fatal")
    .map((d) => `${asset.path}: ${d.category ?? "lint"}`);
};
