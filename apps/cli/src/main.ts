import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "@boyscout/lockfile";
import { GateError, generate, loadConfig } from "@boyscout/runtime";
import { Specification } from "@boyscout/schemas";
import type { Bridge } from "@boyscout/schemas";
import { Command, Option } from "commander";
import { authorCommand } from "./author/command.js";
import { initCommand } from "./init.js";
import type { InitCliOptions } from "./init-prompts.js";

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

/** Run `generate`; returns an exit code. Extracted so the commander action stays a one-liner. */
function generateAction(specPath: string, configPath: string, check: boolean): number {
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

/**
 * Route the CLI. `generate`/`author` run synchronously and return a number; `init` may prompt and
 * returns a Promise. commander parses with `.exitOverride()` so parse errors / --help / --version
 * throw instead of calling process.exit — keeping `main` a pure function that yields an exit code.
 */
export function main(argv: string[]): number | Promise<number> {
  let exitCode = 0;
  let pending: Promise<number> | undefined;

  const program = new Command();
  program
    .name("boyscout")
    .description("Governed deterministic runtime for software generation")
    .version(runtimeVersion)
    .exitOverride();

  program
    .command("generate")
    .description("generate code from the spec and write boyscout.lock")
    .option("--spec <path>", "spec file path", "./boyscout-spec.json")
    .option("--config <path>", "config file path", "./boyscout.config.yaml")
    .option("--check", "fail if output drifts from boyscout.lock", false)
    .action((opts: { spec: string; config: string; check: boolean }) => {
      exitCode = generateAction(opts.spec, opts.config, opts.check);
    });

  program
    .command("author")
    .description("start the local browser authoring loop")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action(() => {
      // author keeps its own flag parsing; forward everything after the command verbatim.
      exitCode = authorCommand(argv.slice(1));
    });

  const initCmd = program
    .command("init")
    .description("scaffold config, spec, and the boyscout skill (safe to re-run)")
    .option("--root <dir>", "target directory", ".")
    .option("--capabilities <list>", "comma-separated capability subset")
    .option("--example", "seed the demo spec (React/Astryx only)", false)
    .option("--yes", "accept defaults without prompting", false);
  initCmd.addOption(new Option("--stack <stack>", "tech stack").choices(["react", "angular"]));
  initCmd.addOption(
    new Option("--agent <agent>", "coding agent").choices(["claude", "cursor", "generic"]),
  );
  initCmd.addOption(
    new Option("--scope <scope>", "where to write agent skills").choices(["local", "global"]),
  );
  initCmd.action((opts: InitCliOptions) => {
    pending = initCommand(opts);
  });

  try {
    program.parse(argv, { from: "user" });
  } catch (err) {
    // exitOverride throws CommanderError; help/version carry exitCode 0, parse errors 1.
    return (err as { exitCode?: number }).exitCode ?? 1;
  }
  return pending ?? exitCode;
}
