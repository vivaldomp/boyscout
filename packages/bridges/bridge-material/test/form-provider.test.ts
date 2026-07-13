import type { FeatureT } from "@boyscout/schemas";
import { describe, expect, it } from "vitest";
import { formProvider } from "../src/form-provider.js";

const feature: FeatureT = {
  id: "signup-form",
  capability: "form",
  tree: {
    type: "Form",
    props: { name: "Signup" },
    children: [
      { type: "Field", props: { name: "email", label: "Email", type: "text" } },
      { type: "Field", props: { name: "age", label: "Age", type: "number" } },
    ],
  },
  annotations: {},
  props: {},
  approved: true,
};

describe("formProvider", () => {
  it("emits one non-durable standalone form component", () => {
    const assets = formProvider.generate(feature);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.path).toBe("components/SignupForm.ts");
    expect(assets[0]?.durable).toBeFalsy();
  });

  it("builds a typed FormGroup with a control per field", () => {
    const c = formProvider.generate(feature)[0]?.content ?? "";
    expect(c).toContain('selector: "signup-form"');
    expect(c).toContain("NonNullableFormBuilder");
    expect(c).toContain("email: this.fb.control<string>");
    expect(c).toContain("age: this.fb.control<number>");
    expect(c).toContain("<mat-form-field>");
    expect(c).toContain('formControlName="email"');
  });

  it("sanitizes untrusted field name/label so they cannot inject TS or break out of the template literal", () => {
    const injected: FeatureT = {
      id: "evil-form",
      capability: "form",
      tree: {
        type: "Form",
        props: { name: "Evil" },
        children: [
          {
            type: "Field",
            // biome-ignore lint/suspicious/noTemplateCurlyInString: literal injection payload under test, not a template placeholder
            props: { name: "x; evil()", label: "L`});${1}<b>", type: "text" },
          },
        ],
      },
      annotations: {},
      props: {},
      approved: true,
    };
    const c = formProvider.generate(injected)[0]?.content ?? "";

    // the untrusted name never appears verbatim as a TS identifier
    expect(c).not.toContain("x; evil()");
    // it is sanitized to a safe camelCase identifier, used consistently
    expect(c).toContain("xEvil: this.fb.control<string>");
    expect(c).toContain('formControlName="xEvil"');

    // backtick from the label cannot terminate the generated template literal
    expect(c).toContain("L\\`");
    expect(c).not.toMatch(/L`/);
    // dollar cannot form a live ${...} interpolation
    expect(c).toContain("\\$");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal string under test, not a template placeholder
    expect(c).not.toContain("${1}");
    // angle brackets are HTML-escaped
    expect(c).toContain("&lt;b&gt;");
    expect(c).not.toContain("<b>");
  });
});
