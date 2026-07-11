import type { CapabilityContract } from "../src/index.js";

// Declarative sample: a bridge-authored concrete input shape plugs into the generic slot.
type ComponentInput = { tag: string; props: Record<string, unknown> };
const declarative: CapabilityContract<ComponentInput, { file: string }> = {
  id: "component",
  version: "1",
  tier: "declarative",
  inputs: { tag: "Box", props: {} },
  outputs: { file: "Box.tsx" },
  validators: ["ast-shape"],
  constraints: {},
  metadata: {},
};

// Logic-bearing sample: carries a seam contract.
type ServiceInput = { name: string; methods: string[] };
const logicBearing: CapabilityContract<ServiceInput, { scaffold: string }> = {
  id: "service",
  version: "1",
  tier: "logic-bearing",
  inputs: { name: "Api", methods: ["get"] },
  outputs: { scaffold: "Api.running.ts" },
  validators: ["seam-signature"],
  constraints: {},
  seam: { srcPath: "src/Api.ts", typedSignature: "get(): Promise<unknown>", binding: "Api" },
  metadata: {},
};

const badTier: CapabilityContract<{ x: number }, { y: number }> = {
  id: "x",
  version: "1",
  // @ts-expect-error — invalid tier literal must not typecheck
  tier: "bogus",
  inputs: { x: 1 },
  outputs: { y: 1 },
  validators: [],
  constraints: {},
  metadata: {},
};

// @ts-expect-error — missing required field (version) must not typecheck
const missingField: CapabilityContract<{ x: number }, { y: number }> = {
  id: "x",
  tier: "declarative",
  inputs: { x: 1 },
  outputs: { y: 1 },
  validators: [],
  constraints: {},
  metadata: {},
};

// Reference the values so they are not elided.
void declarative;
void logicBearing;
void badTier;
void missingField;
