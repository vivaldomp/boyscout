import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
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
export interface GenerateResult {
  emitted: string[];
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
  const validated = validateSpec(opts.specInput, bridge.registry.componentTypes);
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
      assets.push({ path: raw.path, content: format(raw.content, langOf(raw.path)) });
    }
  }

  // verify(): post-barrier.
  const gate = checkAssets(assets, bridge.postRules);
  if (!gate.ok) throw new GateError(gate.violations);

  return assets;
}

/** emit(): disposable write to <outDir>/.running via writeBytes (LF/UTF-8/no-BOM). Path-traversal shielded. */
export function emit(assets: readonly Asset[], outDir: string): string[] {
  const runningDir = join(outDir, ".running");
  const emitted: string[] = [];
  for (const asset of assets) {
    if (
      asset.path.includes("..") ||
      normalize(asset.path) !== asset.path ||
      isAbsolute(asset.path)
    ) {
      throw new Error(`path traversal rejected: "${asset.path}"`);
    }
    const full = join(runningDir, asset.path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, writeBytes(asset.content));
    emitted.push(full);
  }
  return emitted;
}

/** The full protocol: build then emit. */
export function generate(opts: GenerateOpts): GenerateResult {
  const assets = buildAssets(opts);
  return { emitted: emit(assets, opts.outDir) };
}
