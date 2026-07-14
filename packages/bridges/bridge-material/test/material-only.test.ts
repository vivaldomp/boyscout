import type { Asset } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { materialOnly } from "../src/material-only.js";

const asset = (content: string): Asset => ({ path: "components/X.ts", content });

describe("materialOnly", () => {
  it("passes a template using only Material selectors + irreducible form controls", () => {
    const c =
      '@Component({ template: `<mat-card><mat-card-title>Hi</mat-card-title></mat-card>` })';
    expect(materialOnly(asset(c))).toEqual([]);
  });

  it("permits the irreducible native form/interaction tags", () => {
    const c = '@Component({ template: `<form><input matInput><button mat-button>Go</button></form>` })';
    expect(materialOnly(asset(c))).toEqual([]);
  });

  it("flags a bare HTML layout primitive", () => {
    const c = '@Component({ template: `<div><mat-card></mat-card></div>` })';
    const violations = materialOnly(asset(c));
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain("<div>");
  });

  it("ignores assets with no inline template (http/route)", () => {
    expect(materialOnly(asset("export const x = 1;"))).toEqual([]);
  });
});
