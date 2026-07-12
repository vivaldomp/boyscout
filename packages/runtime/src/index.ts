import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";
import { format, type FormatLang, writeBytes } from "@boyscout/determinism";
import { checkAssets } from "@boyscout/guardrails";
import { plan } from "@boyscout/planner";
import {
  BoyscoutConfig,
  type Asset,
  type Bridge,
  type BoyscoutConfigT,
  type FeatureT,
} from "@boyscout/schemas";
import { validateSpec } from "@boyscout/spec";
import { parse as parseYaml } from "yaml";

/** Thrown when a guardrail barrier blocks the pipeline (HTTP-style 422). */
export class GateError extends Error {
  constructor(public readonly violations: string[]) {
    super(`gate failed (422): ${violations.join("; ")}`);
    this.name = "GateError";
  }
}

export interface BuildOpts {
  specInput: unknown;
  config: BoyscoutConfigT;
  bridge: Bridge;
}
export interface GenerateOpts extends BuildOpts {
  outDir: string;
}

/** load(): parse + validate boyscout.config.yaml. Fail-fast on invalid config. */
export function loadConfig(yamlText: string): BoyscoutConfigT {
  const parsed = BoyscoutConfig.safeParse(parseYaml(yamlText));
  if (!parsed.success) throw new Error(`invalid boyscout.config.yaml: ${parsed.error.message}`);
  return parsed.data;
}

const LANG_BY_EXT: Record<string, FormatLang> = {
  ".tsx": "tsx",
  ".ts": "ts",
  ".js": "js",
  ".json": "json",
  ".css": "css",
};

function langOf(path: string): FormatLang {
  const ext = path.slice(path.lastIndexOf("."));
  const lang = LANG_BY_EXT[ext];
  if (!lang) throw new Error(`no formatter for asset "${path}"`);
  return lang;
}

/** resolve() -> validate() -> plan() -> generate() -> format() -> verify(). Returns formatted assets; no emit. */
export function buildAssets(opts: BuildOpts): Asset[] {
  const { config, bridge } = opts;

  // resolve(): the loaded bridge must match the composition the config/spec declares.
  if (config.bridge !== bridge.id) {
    throw new Error(`config bridge "${config.bridge}" != loaded bridge "${bridge.id}"`);
  }

  // validate(): Zod gate + pre-barrier.
  const validated = validateSpec(opts.specInput, bridge.registry);
  if (!validated.ok) throw new GateError(validated.violations);
  const spec = validated.spec;

  if (spec.metadata.bridge !== bridge.id || spec.metadata.platform !== bridge.platform) {
    throw new Error(`spec metadata (${spec.metadata.bridge}/${spec.metadata.platform}) != bridge`);
  }

  // plan(): deterministic ordering.
  const graph = plan(spec);
  const featureById = new Map<string, FeatureT>(spec.features.map((f) => [f.id, f]));

  // generate() + format(), in graph order.
  const assets: Asset[] = [];
  for (const id of graph.ordering) {
    const feature = featureById.get(id);
    if (!feature) throw new Error(`graph node "${id}" has no feature`);
    const provider = bridge.registry.providerFor(feature.capability);
    if (!provider) throw new Error(`no provider for capability "${feature.capability}"`);
    for (const raw of provider.generate(feature)) {
      assets.push({
        path: raw.path,
        content: format(raw.content, langOf(raw.path)),
        ...(raw.durable !== undefined ? { durable: raw.durable } : {}),
      });
    }
  }

  // verify(): post-barrier — scaffold assets only (durable human bodies are lint-level, D2d).
  const gate = checkAssets(
    assets.filter((a) => !a.durable),
    bridge.postRules,
  );
  if (!gate.ok) throw new GateError(gate.violations);

  return assets;
}

export interface GenerateResult {
  emitted: string[];
  preserved: string[];
}

export interface EmitResult {
  scaffolds: string[];
  durablesCreated: string[];
  durablesPreserved: string[];
}

function assertSafe(p: string): void {
  // Asset paths are POSIX-style forward-slash relative paths. Validate with posix
  // semantics so a legitimate "services/X.ts" is not flagged on Windows, where the
  // OS normalize() rewrites "/"->"\" and would trip normalize(p) !== p. Reject
  // traversal and both absolute conventions (posix "/foo", win32 "C:\" / "\\host").
  if (p.includes("..") || posix.normalize(p) !== p || posix.isAbsolute(p) || win32.isAbsolute(p)) {
    throw new Error(`path traversal rejected: "${p}"`);
  }
}

/**
 * emit() — two modes (D2b). Scaffolds (durable !== true) overwrite into <outDir>/.running (idempotent).
 * Durables create-if-absent into <outDir>/src — an existing human file is preserved, never overwritten.
 * Both targets path-traversal shielded.
 */
export function emit(assets: readonly Asset[], outDir: string): EmitResult {
  const scaffolds: string[] = [];
  const durablesCreated: string[] = [];
  const durablesPreserved: string[] = [];
  for (const asset of assets) {
    assertSafe(asset.path);
    if (asset.durable) {
      const full = join(outDir, "src", asset.path);
      if (existsSync(full)) {
        durablesPreserved.push(full);
        continue;
      }
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, writeBytes(asset.content));
      durablesCreated.push(full);
    } else {
      const full = join(outDir, ".running", asset.path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, writeBytes(asset.content));
      scaffolds.push(full);
    }
  }
  return { scaffolds, durablesCreated, durablesPreserved };
}

/** The full protocol: build then emit. Reports newly emitted paths and preserved human files. */
export function generate(opts: GenerateOpts): GenerateResult {
  const assets = buildAssets(opts);
  const { scaffolds, durablesCreated, durablesPreserved } = emit(assets, opts.outDir);
  return { emitted: [...scaffolds, ...durablesCreated], preserved: durablesPreserved };
}
