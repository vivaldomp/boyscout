import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const uiSrc = fileURLToPath(new URL("../boyscout-ui/dist", import.meta.url));

/**
 * E3: bundle @boyscout/* only; every third-party dependency stays external and is declared,
 * pinned, in package.json. This is forced, not stylistic — @biomejs/wasm-nodejs is a WASM
 * artifact esbuild cannot inline, and it is the hermetic formatter D3b's byte-identity rests
 * on. Externalising all third-party code keeps dev and published builds on identical paths.
 */
const external = [
  "@astryxdesign/core",
  "@biomejs/js-api",
  "@biomejs/wasm-nodejs",
  "@clack/prompts",
  "@hono/node-server",
  "commander",
  "eta",
  "hono",
  "typescript",
  "yaml",
  "zod",
];

rmSync(`${root}dist`, { recursive: true, force: true });
rmSync(`${root}templates`, { recursive: true, force: true });

// No `banner` — esbuild hoists the shebang already present in src/bin.ts to line 1.
// Adding one here would emit a double shebang and break the binary.
await build({
  entryPoints: [`${root}src/bin.ts`],
  outfile: `${root}dist/bin.js`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
});

// The astryx-react and material bridges load their .eta templates at runtime via
// `new URL("../templates/x.eta", import.meta.url)`, resolved relative to each
// source file. Bundling collapses every module's import.meta.url to dist/bin.js's
// URL, so that lookup now resolves to <package-root>/templates regardless of
// which bridge shipped the file. Mirror both bridges' templates there so the
// bundled binary still finds them.
const templateDirs = [
  `${repo}packages/bridges/bridge-astryx-react/templates`,
  `${repo}packages/bridges/bridge-material/templates`,
];

// ponytail: guard against template filename collisions. cpSync defaults to
// force: true, so duplicate filenames silently overwrite. A collision would cause
// wrong generation with zero signal, breaking BoyScout's byte-identity guarantee.
// This guard converts that silent failure into a loud build break.
const basenames = new Map();
for (const dir of templateDirs) {
  for (const file of readdirSync(dir)) {
    if (basenames.has(file)) {
      console.error(`Template collision: "${file}" in both ${basenames.get(file)} and ${dir}`);
      process.exit(1);
    }
    basenames.set(file, dir);
  }
}

for (const dir of templateDirs) {
  cpSync(dir, `${root}templates`, { recursive: true });
}

if (!existsSync(uiSrc)) {
  console.error("boyscout-ui is not built — run: pnpm --filter boyscout-ui build");
  process.exit(1);
}
cpSync(uiSrc, `${root}dist/ui`, { recursive: true });

// npm sources README/LICENSE from the package directory, not the repo root.
cpSync(`${repo}README.md`, `${root}README.md`);
cpSync(`${repo}LICENSE`, `${root}LICENSE`);

console.log("built dist/bin.js + dist/ui");
