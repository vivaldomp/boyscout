import { Biome } from "@biomejs/js-api/nodejs";
import type { ProjectKey } from "@biomejs/wasm-nodejs";

export type FormatLang = "ts" | "tsx" | "js" | "json" | "css";

const VIRTUAL_PATH: Record<FormatLang, string> = {
  ts: "file.ts",
  tsx: "file.tsx",
  js: "file.js",
  json: "file.json",
  css: "file.css",
};

// Explicit in-memory config — the hermetic contract. No ambient biome.json is ever read.
const CONFIG = {
  formatter: {
    enabled: true,
    indentStyle: "space",
    indentWidth: 2,
    lineWidth: 100,
    lineEnding: "lf",
  },
  javascript: {
    formatter: { quoteStyle: "double", semicolons: "always", trailingCommas: "all" },
  },
  json: { formatter: { enabled: true } },
  css: { formatter: { enabled: true } },
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

/** Format source with a pinned, hermetic Biome instance. */
export function format(source: string, lang: FormatLang): string {
  const { biome, projectKey } = instance();
  const { content } = biome.formatContent(projectKey, source, { filePath: VIRTUAL_PATH[lang] });
  return content;
}
