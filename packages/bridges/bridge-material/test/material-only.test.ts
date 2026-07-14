import type { Asset, FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { formProvider } from "../src/form-provider.js";
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

  it("does not flag TS generic type arguments outside the template (e.g. this.fb.control<string>(...))", () => {
    const c = `
      @Component({ template: \`<mat-card><mat-card-title>Hi</mat-card-title></mat-card>\` })
      export class X {
        readonly form = this.fb.group({
          email: this.fb.control<string>(""),
          age: this.fb.control<number>(0),
        });
      }
    `;
    expect(materialOnly(asset(c))).toEqual([]);
  });

  it("passes real form-provider output (generics in class body must not trip the guardrail)", () => {
    const feature: FeatureT = {
      id: "signup-form",
      capability: "form",
      tree: {
        type: "Form",
        props: { name: "Signup" },
        children: [{ type: "Field", props: { name: "email", label: "Email", type: "text" } }],
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const generated = formProvider.generate(feature)[0];
    expect(generated).toBeDefined();
    if (!generated) throw new Error("expected an asset");
    expect(materialOnly(generated)).toEqual([]);
  });
});
