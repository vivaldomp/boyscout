import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { bridge } from "@boyscout/bridge-astryx-react";
import { GateError, generate, loadConfig } from "@boyscout/runtime";

function flag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}

/** `boyscout generate [--spec ./boyscout-spec.json] [--config ./boyscout.config.yaml]`. Returns an exit code. */
export function main(argv: string[]): number {
  const command = argv[0];
  if (command !== "generate") {
    process.stderr.write(`unknown command: ${command ?? "(none)"}\nusage: boyscout generate\n`);
    return 1;
  }
  const specPath = flag(argv, "--spec", "./boyscout-spec.json");
  const configPath = flag(argv, "--config", "./boyscout.config.yaml");

  try {
    const config = loadConfig(readFileSync(configPath, "utf8"));
    const specInput = JSON.parse(readFileSync(specPath, "utf8"));
    const { emitted } = generate({ specInput, config, bridge, outDir: dirname(specPath) });
    for (const path of emitted) process.stdout.write(`${path}\n`);
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
