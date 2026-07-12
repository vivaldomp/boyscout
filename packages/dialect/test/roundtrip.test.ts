import type { SpecificationT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { parseOpenui, serializeOpenui } from "../src/index.js";
import { mockRegistry } from "./mock-registry.js";

const CANONICAL = `spec version=1 bridge=astryx-react platform=react

component user-card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
      Button("primary", "Edit")
    }
  }
`;

function feature(capability: string, id: string, tree: SpecificationT["features"][number]["tree"]) {
  return { id, capability, tree, annotations: {}, props: {}, approved: true };
}
function spec(f: SpecificationT["features"][number]): SpecificationT {
  return { version: "1", features: [f], metadata: { bridge: "astryx-react", platform: "react", checksum: "" } };
}

const CORPUS: SpecificationT[] = [
  spec(feature("component", "user-card", {
    type: "Card",
    children: [{
      type: "VStack", props: { gap: 2 },
      children: [
        { type: "Heading", props: { level: 3, text: "Profile" } },
        { type: "Text", props: { type: "body", text: "Member since 2026" } },
        { type: "Button", props: { variant: "primary", text: "Edit" } },
      ],
    }],
  })),
  spec(feature("service", "user-service", {
    type: "Service", props: { name: "UserService" },
    children: [{ type: "Method", props: { name: "getUsers", params: "", returns: "Promise<User[]>" } }],
  })),
  spec(feature("store", "cart", {
    type: "Store", props: { name: "Cart", state: "CartState" },
    children: [{ type: "Action", props: { name: "addItem", payload: "Item" } }],
  })),
  spec(feature("http", "users-api", {
    type: "Http", props: { name: "UsersApi" },
    children: [{ type: "Endpoint", props: { name: "list", method: "GET", path: "/users", response: "User[]" } }],
  })),
];

describe("serializeOpenui + round-trip laws", () => {
  it("serializes the user-card spec to the exact canonical form", () => {
    expect(serializeOpenui(CORPUS[0]!, mockRegistry)).toBe(CANONICAL);
  });

  for (const s of CORPUS) {
    const id = s.features[0]!.id;
    it(`law 2 (AST-lossless): ${id} -> serialize -> parse == spec`, () => {
      expect(parseOpenui(serializeOpenui(s, mockRegistry), mockRegistry)).toEqual(s);
    });
    it(`law 1+3 (canonical fixed point / convergence): ${id}`, () => {
      const text = serializeOpenui(s, mockRegistry);
      expect(serializeOpenui(parseOpenui(text, mockRegistry), mockRegistry)).toBe(text);
    });
  }

  it("law 3 (messy input converges to canonical in one pass)", () => {
    const messy = `spec   version=1   bridge=astryx-react  platform=react\ncomponent user-card =\nCard{VStack(2){Heading(3,"Profile") Text("body","Member since 2026") Button("primary","Edit")}}`;
    expect(serializeOpenui(parseOpenui(messy, mockRegistry), mockRegistry)).toBe(CANONICAL);
  });

  it("throws when a prop is not in the node's parameter list", () => {
    const bogus = spec(feature("component", "x", { type: "Card", props: { color: "red" } }));
    expect(() => serializeOpenui(bogus, mockRegistry)).toThrow(/not in its parameter list/);
  });
});
