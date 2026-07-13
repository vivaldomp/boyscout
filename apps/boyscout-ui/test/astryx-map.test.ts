import { COMPONENTS } from "@boyscout/bridge-astryx-react";
import { describe, expect, it } from "vitest";
import { ASTRYX_COMPONENT_NODES } from "../src/astryx-nodes.js";

describe("astryx preview map parity", () => {
  it("covers exactly the bridge's component-capability node types", () => {
    expect([...ASTRYX_COMPONENT_NODES].sort()).toEqual([...COMPONENTS].sort());
  });
});
