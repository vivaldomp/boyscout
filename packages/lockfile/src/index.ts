import { canonicalJson, sortByBytes, writeBytes } from "@boyscout/determinism";
import type { Bridge, SpecificationT } from "@boyscout/schemas";

/** The transitive closure that produced a generation — the reproducibility pin (D3b). */
export interface LockClosure {
  readonly runtimeVersion: string;
  readonly bridge: { readonly id: string; readonly version: string };
  /** Capability names the spec's features used, sorted by bytes, de-duplicated. */
  readonly capabilities: readonly string[];
  readonly checksum: string;
}

/**
 * Build the closure from the validated spec + resolved bridge. Only what the
 * generation touched — capability names the spec uses, not the whole registry.
 * Bridge-version granularity: the registry does not surface per-capability
 * contracts, and the bridge is the versioned unit (§23).
 */
export function buildLockClosure(input: {
  spec: SpecificationT;
  bridge: Bridge;
  runtimeVersion: string;
}): LockClosure {
  const unique = [...new Set(input.spec.features.map((f) => f.capability))];
  return {
    runtimeVersion: input.runtimeVersion,
    bridge: { id: input.bridge.id, version: input.bridge.version },
    capabilities: sortByBytes(unique, (c) => c),
    checksum: input.spec.metadata.checksum,
  };
}

/** Canonical, byte-stable serialization (canonicalJson -> writeBytes). */
export function serializeLock(closure: LockClosure): string {
  return new TextDecoder().decode(writeBytes(canonicalJson(closure)));
}

/** Parse a serialized lock back to a closure (structural; no validation beyond JSON). */
export function parseLock(text: string): LockClosure {
  return JSON.parse(text) as LockClosure;
}

/** Human-readable drift lines; [] = identical. Direction: expected -> actual. */
export function diffLock(expected: LockClosure, actual: LockClosure): string[] {
  if (serializeLock(expected) === serializeLock(actual)) return [];
  const lines: string[] = [];
  const cmp = (label: string, a: string, b: string) => {
    if (a !== b) lines.push(`${label}: ${a} -> ${b}`);
  };
  cmp("runtimeVersion", expected.runtimeVersion, actual.runtimeVersion);
  cmp("bridge.id", expected.bridge.id, actual.bridge.id);
  cmp("bridge.version", expected.bridge.version, actual.bridge.version);
  cmp("checksum", expected.checksum, actual.checksum);
  cmp("capabilities", expected.capabilities.join(","), actual.capabilities.join(","));
  return lines;
}
