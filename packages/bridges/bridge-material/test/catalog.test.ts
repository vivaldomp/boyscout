import { describe, expect, it } from "vitest";
import { CATALOG, COMPONENTS, paramsFor } from "../src/catalog.js";
import { verifyMaterialCatalog } from "../src/verify-catalog.js";

describe("material catalog", () => {
  it("lists Material element-selector components with real subpaths", () => {
    expect(COMPONENTS).toContain("Card");
    expect(CATALOG.Card?.selector).toBe("mat-card");
    expect(CATALOG.Card?.symbol).toBe("MatCard");
    expect(CATALOG.Card?.importPath).toBe("@angular/material/card");
  });

  it("paramsFor returns positional names, [] for unknown", () => {
    expect(paramsFor("Card")).toEqual([]);
    expect(paramsFor("Nope")).toEqual([]);
  });

  it("every catalog symbol is a real @angular/material export (self-verifiable registry)", () => {
    expect(() => verifyMaterialCatalog()).not.toThrow();
  });
});
