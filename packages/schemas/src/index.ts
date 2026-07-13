import { z } from "zod";

/** OpenUI-lang AST node ("one AST", §17.1). Recursive; props stay generic (bridge-owned). */
export interface AstNodeT {
  type: string;
  props?: Record<string, unknown> | undefined;
  children?: AstNodeT[] | undefined;
}
export const AstNode: z.ZodType<AstNodeT> = z.lazy(() =>
  z.object({
    type: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(AstNode).optional(),
  }),
);

export const Feature = z.object({
  id: z.string(),
  capability: z.string(),
  tree: AstNode,
  annotations: z.record(z.string(), z.unknown()).default({}),
  props: z.record(z.string(), z.unknown()).default({}),
  approved: z.boolean(),
});
export type FeatureT = z.infer<typeof Feature>;

export const Specification = z.object({
  version: z.string(),
  features: z.array(Feature),
  metadata: z.object({
    bridge: z.string(),
    platform: z.string(),
    checksum: z.string(),
  }),
});
export type SpecificationT = z.infer<typeof Specification>;

export const BoyscoutConfig = z.object({
  platform: z.string(),
  bridge: z.string(),
  capabilities: z.array(z.string()),
  bridges: z.record(z.string(), z.unknown()).default({}),
  guardrails: z.record(z.string(), z.unknown()).default({}),
  templates: z.record(z.string(), z.unknown()).default({}),
});
export type BoyscoutConfigT = z.infer<typeof BoyscoutConfig>;

export const ExecutionGraph = z.object({
  nodes: z.array(z.object({ id: z.string(), capability: z.string() })),
  edges: z.array(z.object({ from: z.string(), to: z.string() })),
  ordering: z.array(z.string()),
});
export type ExecutionGraphT = z.infer<typeof ExecutionGraph>;

/** Durable scaffold <-> human-logic seam (D2d). */
export const SeamContract = z.object({
  srcPath: z.string(),
  typedSignature: z.string(),
  binding: z.string(),
});
export type SeamContractT = z.infer<typeof SeamContract>;

export const Event = z.object({
  type: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type EventT = z.infer<typeof Event>;

export const GuardrailResult = z.object({
  ok: z.boolean(),
  violations: z.array(z.string()),
  code: z.number(),
});
export type GuardrailResultT = z.infer<typeof GuardrailResult>;

/**
 * Abstract contract every Registry entry satisfies. Generic over the concrete
 * input/output shapes, which are authored per-Bridge (Astryx SP2, Material SP6) —
 * NOT here (§8/§14.3). This interface is the shared shape; the props are not.
 */
export interface CapabilityContract<In = unknown, Out = unknown> {
  id: string;
  version: string;
  tier: "declarative" | "logic-bearing";
  inputs: In;
  outputs: Out;
  validators: string[];
  constraints: Record<string, unknown>;
  seam?: SeamContractT;
  metadata: Record<string, unknown>;
}

/** An emitted file before it is written to disk. `content` is raw at generate(), formatted after format(). */
export interface Asset {
  path: string;
  content: string;
  /** true = durable human-owned stub (src/, create-if-absent); false/undefined = disposable scaffold (.running/). */
  durable?: boolean;
}

/** A post-generation guardrail check over one asset. Returns violation messages ([] = pass). */
export type AssetRule = (asset: Asset) => string[];

/** Implements one capability: turns a feature into raw assets. Bridge-owned; never calls the Runtime. */
export interface Provider {
  readonly capability: string;
  generate(feature: FeatureT): Asset[];
}

/** The bridge's typed catalog: capabilities, per-capability allowed AST node types, and providers. */
export interface BridgeRegistry {
  readonly capabilities: readonly string[];
  nodeTypesFor(capability: string): readonly string[];
  /** Ordered positional parameter names for an AST node type (SP4a DSL binding). Unknown type -> []. */
  paramsFor(nodeType: string): readonly string[];
  providerFor(capability: string): Provider | undefined;
}

/** A complete binding of a Platform to the Runtime. The Runtime consumes this by interface — never imports it. */
export interface Bridge {
  readonly id: string;
  readonly platform: string;
  readonly registry: BridgeRegistry;
  readonly postRules: readonly AssetRule[];
}
