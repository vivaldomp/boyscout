import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { parseOpenui } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const SRC = `spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
`;

const EXPECTED: SpecificationT = {
  version: "1",
  features: [
    {
      id: "user-card",
      capability: "component",
      tree: {
        type: "Card",
        children: [
          {
            type: "VStack",
            props: { gap: 2 },
            children: [
              { type: "Heading", props: { level: 3, text: "Profile" } },
              { type: "Text", props: { type: "body", text: "Member since 2026" } },
              { type: "Button", props: { variant: "primary", text: "Edit" } },
            ],
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    },
  ],
  metadata: { bridge: "astryx-react", platform: "react", checksum: "" },
};

describe("parseOpenui", () => {
  it("binds positional args to named props and defaults workflow fields", () => {
    expect(parseOpenui(SRC, mockRegistry)).toEqual(EXPECTED);
  });

  it("rejects an unknown node type with a line number", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Bogus\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/unknown node type "Bogus".*line 3/s);
  });

  it("rejects more args than the node has params", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Card(1)\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/takes 0 argument/);
  });

  it("rejects an unknown capability", () => {
    const bad = `spec version=1 bridge=b platform=p\nwidget x =\n  Card\n`;
    expect(() => parseOpenui(bad, mockRegistry)).toThrow(/unknown capability "widget"/);
  });

  it("rejects a missing header field", () => {
    expect(() => parseOpenui(`spec version=1 bridge=b\ncomponent x =\n  Card\n`, mockRegistry)).toThrow(
      /missing "spec platform/,
    );
  });
});
