import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "@boyscout/lockfile";
import { GateError, generate, loadConfig } from "@boyscout/runtime";
import { Specification } from "@boyscout/schemas";
import type { Bridge } from "@boyscout/schemas";
import { authorCommand } from "./author/command.js";
import { initCommand } from "./init.js";

// The published CLI bundles @boyscout/runtime, so that package is not resolvable at runtime.
// `../package.json` resolves from both src/main.ts (dev) and dist/bin.js (published); in a
// bundled distribution the CLI version *is* the runtime version.
const runtimeVersion = (createRequire(import.meta.url)("../package.json") as { version: string })
  .version;

const BRIDGES: Record<string, Bridge> = {
  "astryx-react": astryxBridge,
  material: materialBridge,
};

/** Resolve a bridge by its config id. Unknown id -> undefined. */
export function selectBridge(id: string): Bridge | undefined {
  return BRIDGES[id];
}

function flag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}

/** `boyscout generate [--spec ./boyscout-spec.json] [--config ./boyscout.config.yaml]`. Returns an exit code (async for `init`, which may prompt). */
export function main(argv: string[]): number | Promise<number> {
  const command = argv[0];
  if (command === "init") return initCommand(argv.slice(1));
  if (command === "author") return authorCommand(argv.slice(1));
  if (command !== "generate") {
    process.stderr.write(
      `unknown command: ${command ?? "(none)"}\nusage: boyscout init | boyscout generate | boyscout author\n`,
    );
    return 1;
  }
  const specPath = flag(argv, "--spec", "./boyscout-spec.json");
  const configPath = flag(argv, "--config", "./boyscout.config.yaml");
  const check = argv.includes("--check");

  try {
    const config = loadConfig(readFileSync(configPath, "utf8"));
    const bridge = selectBridge(config.bridge);
    if (!bridge) {
      process.stderr.write(`unknown bridge: ${config.bridge}\n`);
      return 1;
    }
    const specInput = JSON.parse(readFileSync(specPath, "utf8"));
    const { emitted, preserved } = generate({
      specInput,
      config,
      bridge,
      outDir: dirname(specPath),
    });
    for (const path of emitted) process.stdout.write(`${path}\n`);
    for (const path of preserved) process.stdout.write(`preserved: ${path}\n`);

    const spec = Specification.parse(specInput);
    const closure = buildLockClosure({ spec, bridge, runtimeVersion });
    const lockPath = join(dirname(specPath), "boyscout.lock");
    if (check) {
      const drift = diffLock(parseLock(readFileSync(lockPath, "utf8")), closure);
      if (drift.length > 0) {
        process.stderr.write(`boyscout.lock drift:\n${drift.map((d) => `  - ${d}`).join("\n")}\n`);
        return 1;
      }
    } else {
      writeFileSync(lockPath, serializeLock(closure));
    }
    return 0;
  } catch (err) {
    if (err instanceof GateError) {
      process.stderr.write(
        `422 gate failed:\n${err.violations.map((v) => `  - ${v}`).join("\n")}\n`,
      );
    } else {
      process.stderr.write(`error: ${(err as Error).message}\n`);
    }
    return 1;
  }
}
