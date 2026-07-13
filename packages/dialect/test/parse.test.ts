import { describe, expect, it } from "vitest";
import { DialectError, parseOpenuiRaw } from "../src/parse.js";

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

describe("parseOpenuiRaw", () => {
  it("parses header, feature, positional args, and nested children", () => {
    const file = parseOpenuiRaw(SRC);
    expect(file.header).toEqual({ version: "1", bridge: "astryx-react", platform: "react" });
    expect(file.features).toHaveLength(1);
    const f = file.features[0];
    if (!f) throw new Error("fixture");
    expect(f.capability).toBe("component");
    expect(f.id).toBe("user-card");
    expect(f.node.type).toBe("Card");
    expect(f.node.args).toEqual([]);
    const vstack = f.node.children[0];
    if (!vstack) throw new Error("fixture");
    expect(vstack.type).toBe("VStack");
    expect(vstack.args).toEqual([2]);
    expect(vstack.children.map((c) => c.type)).toEqual(["Heading", "Text", "Button"]);
    const heading = vstack.children[0];
    if (!heading) throw new Error("fixture");
    expect(heading.args).toEqual([3, "Profile"]);
  });

  it("parses string escapes and boolean/null literals", () => {
    const file = parseOpenuiRaw(
      `spec version=1 bridge=b platform=p\ncomponent x =\n  Text("a \\"q\\" z", "y")\n`,
    );
    const feature = file.features[0];
    if (!feature) throw new Error("fixture");
    expect(feature.node.args).toEqual(['a "q" z', "y"]);
  });

  it("throws with a line number on an unterminated string", () => {
    const bad = `spec version=1 bridge=b platform=p\ncomponent x =\n  Text("oops)\n`;
    expect(() => parseOpenuiRaw(bad)).toThrow(DialectError);
    try {
      parseOpenuiRaw(bad);
    } catch (e) {
      expect((e as DialectError).line).toBe(3);
    }
  });

  it("throws on an unexpected token where a literal is required", () => {
    expect(() =>
      parseOpenuiRaw(`spec version=1 bridge=b platform=p\ncomponent x =\n  Text(body)\n`),
    ).toThrow(/expected a literal/);
  });

  it("throws on a brace/paren mismatch", () => {
    expect(() =>
      parseOpenuiRaw(`spec version=1 bridge=b platform=p\ncomponent x =\n  Card {\n`),
    ).toThrow(DialectError);
  });
});
