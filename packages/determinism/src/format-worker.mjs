import { parentPort } from "node:worker_threads";
import { Biome } from "@biomejs/js-api/nodejs";

const VIRTUAL_PATH = {
  ts: "file.ts",
  tsx: "file.tsx",
  js: "file.js",
  json: "file.json",
  css: "file.css",
};

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
};

let cached = null;
function instance() {
  if (cached) return cached;
  const biome = new Biome();
  const { projectKey } = biome.openProject("/");
  biome.applyConfiguration(projectKey, CONFIG);
  cached = { biome, projectKey };
  return cached;
}

if (!parentPort) throw new Error("format-worker must run as a worker_threads worker");

parentPort.on("message", (msg) => {
  const { id, source, lang } = msg;
  try {
    const { biome, projectKey } = instance();
    const { content } = biome.formatContent(projectKey, source, { filePath: VIRTUAL_PATH[lang] });
    parentPort.postMessage({ id, content });
  } catch (e) {
    parentPort.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
});
