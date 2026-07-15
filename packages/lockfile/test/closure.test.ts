import { bridge } from "@boyscout/bridge-astryx-react";
import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { buildLockClosure, diffLock, parseLock, serializeLock } from "../src/index.js";

const spec: SpecificationT = {
  version: "1",
  features: [
    {
      id: "b",
      capability: "store",
      tree: { type: "root", children: [] },
      annotations: {},
      props: {},
      approved: true,
    },
    {
      id: "a",
      capability: "component",
      tree: { type: "root", children: [] },
      annotations: {},
      props: {},
      approved: true,
    },
    {
      id: "c",
      capability: "component",
      tree: { type: "root", children: [] },
      annotations: {},
      props: {},
      approved: true,
    },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "deadbeef" },
};

describe("buildLockClosure", () => {
  it("pins runtime, bridge id+version, sorted-unique capabilities, and checksum", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    expect(c).toEqual({
      runtimeVersion: "0.0.0",
      bridge: { id: "astryx-react", version: "0.1.0" },
      capabilities: ["component", "store"], // sorted by bytes, de-duped
      checksum: "deadbeef",
    });
  });

  it("is order-independent: shuffled features -> identical serialization", () => {
    const rev: SpecificationT = { ...spec, features: [...spec.features].reverse() };
    expect(serializeLock(buildLockClosure({ spec: rev, bridge, runtimeVersion: "0.0.0" }))).toBe(
      serializeLock(buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" })),
    );
  });
});

describe("serializeLock / parseLock", () => {
  it("is byte-stable and round-trips", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    const s = serializeLock(c);
    expect(s.endsWith("\n")).toBe(true); // canonical single trailing newline
    expect(serializeLock(c)).toBe(s); // stable across runs
    expect(parseLock(s)).toEqual(c);
  });
});

describe("diffLock", () => {
  it("returns [] for identical closures", () => {
    const c = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    expect(diffLock(c, c)).toEqual([]);
  });

  it("names each drifted field (expected -> actual)", () => {
    const a = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.0" });
    const b = buildLockClosure({ spec, bridge, runtimeVersion: "0.0.1" });
    expect(diffLock(a, b)).toEqual(["runtimeVersion: 0.0.0 -> 0.0.1"]);
  });
});
