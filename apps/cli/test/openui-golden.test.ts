import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "@boyscout/bridge-astryx-react";
import { hash, writeBytes } from "@boyscout/determinism";
import { parseOpenui, serializeOpenui } from "@boyscout/dialect";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === "1";
const SOURCE = `spec version=1 bridge=astryx-react platform=react

component card =
  Card {
    VStack(2) {
      Heading(3, "Profile")
      Text("body", "Member since 2026")
    }
  }`;

describe("SP4b: .openui write path is byte-stable cross-OS", () => {
  it("writeBytes(serializeOpenui(spec)) matches the committed golden", () => {
    const spec = parseOpenui(SOURCE, registry);
    const bytes = writeBytes(serializeOpenui(spec, registry));
    const golden = here("./goldens/openui/canonical.openui");
    if (UPDATE) {
      mkdirSync(dirname(golden), { recursive: true });
      writeFileSync(golden, bytes);
      return;
    }
    expect(existsSync(golden), "missing .openui golden").toBe(true);
    expect(hash(bytes)).toBe(hash(readFileSync(golden)));
  });
});
