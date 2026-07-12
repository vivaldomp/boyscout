import type { AstNodeT, FeatureT, SpecificationT } from "@boyscout/schemas";
import { DialectError, type Literal, type RawFeature, type RawFile, type RawNode } from "./parse.js";

export interface DialectRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];
  paramsFor(nodeType: string): readonly string[];
}

function bindNode(
  raw: RawNode,
  capability: string,
  allowed: ReadonlySet<string>,
  reg: DialectRegistry,
): AstNodeT {
  if (!allowed.has(raw.type)) {
    throw new DialectError(`unknown node type "${raw.type}" for capability "${capability}"`, raw.line);
  }
  const params = reg.paramsFor(raw.type);
  if (raw.args.length > params.length) {
    throw new DialectError(
      `"${raw.type}" takes ${params.length} argument(s) but got ${raw.args.length}`,
      raw.line,
    );
  }
  const node: AstNodeT = { type: raw.type };
  if (raw.args.length > 0) {
    const props: Record<string, Literal> = {};
    raw.args.forEach((v, idx) => {
      const key = params[idx]; // guarded: args.length <= params.length, so key is defined
      if (key !== undefined) props[key] = v;
    });
    node.props = props;
  }
  if (raw.children.length > 0) {
    node.children = raw.children.map((c) => bindNode(c, capability, allowed, reg));
  }
  return node;
}

function bindFeature(raw: RawFeature, reg: DialectRegistry): FeatureT {
  if (!reg.capabilities.includes(raw.capability)) {
    throw new DialectError(`unknown capability "${raw.capability}"`, raw.line);
  }
  const allowed = new Set(reg.nodeTypesFor(raw.capability));
  return {
    id: raw.id,
    capability: raw.capability,
    tree: bindNode(raw.node, raw.capability, allowed, reg),
    annotations: {},
    props: {},
    approved: true,
  };
}

export function bind(file: RawFile, reg: DialectRegistry): SpecificationT {
  const h = file.header;
  const version = h.version;
  const bridge = h.bridge;
  const platform = h.platform;
  if (version === undefined || bridge === undefined || platform === undefined) {
    const missing = version === undefined ? "version" : bridge === undefined ? "bridge" : "platform";
    throw new DialectError(`missing "spec ${missing}=..." in header`, 1);
  }
  return {
    version,
    features: file.features.map((f) => bindFeature(f, reg)),
    metadata: { bridge, platform, checksum: "" },
  };
}
