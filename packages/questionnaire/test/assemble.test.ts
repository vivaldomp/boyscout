import { describe, expect, it } from "vitest";
import { assembleDoc } from "../src/assemble.js";

describe("assembleDoc", () => {
  it("emits header + one block per contribution in order (version fixed at 1)", () => {
    const doc = assembleDoc("astryx-react", "react", [
      { id: "a", capability: "component", openui: 'Card { Heading(2, "A") }' },
      { id: "b", capability: "service", openui: 'Service("S") {}' },
    ]);
    expect(doc).toBe(
      "spec version=1 bridge=astryx-react platform=react\n\n" +
        'component a =\nCard { Heading(2, "A") }\n\n' +
        'service b =\nService("S") {}\n',
    );
  });

  it("trims fragment whitespace so block-scalar YAML fragments assemble cleanly", () => {
    const doc = assembleDoc("astryx-react", "react", [
      { id: "a", capability: "component", openui: "\n  Card {}\n" },
    ]);
    expect(doc).toBe(
      "spec version=1 bridge=astryx-react platform=react\n\ncomponent a =\nCard {}\n",
    );
  });
});
