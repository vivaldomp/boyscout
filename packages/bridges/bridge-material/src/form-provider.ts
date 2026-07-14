import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render } from "@boyscout/codegen";
import type { Asset, AstNodeT, FeatureT, Provider } from "@boyscout/schemas";
import { escapeAttr, escapeText } from "./escape.js";
import { camel, kebab, pascal } from "./naming.js";

export const FORM_NODE_TYPES: readonly string[] = ["Form", "Field"];

const TEMPLATE = readFileSync(
  fileURLToPath(new URL("../templates/form.ts.eta", import.meta.url)),
  "utf8",
);

interface Field {
  key: string;
  label: string;
  inputType: string;
  tsType: string;
  initial: string;
}

function fieldsOf(tree: AstNodeT): Field[] {
  return (tree.children ?? [])
    .filter((c) => c.type === "Field")
    .map((c) => {
      const p = c.props ?? {};
      const inputType = String(p.type ?? "text");
      const isNumber = inputType === "number";
      return {
        key: camel(String(p.name ?? "")),
        label: String(p.label ?? ""),
        inputType,
        tsType: isNumber ? "number" : "string",
        initial: isNumber ? "0" : '""',
      };
    });
}

function renderBody(fields: Field[]): string {
  const controls = fields
    .map(
      (f) =>
        `<mat-form-field><mat-label>${escapeText(f.label)}</mat-label>` +
        `<input matInput type="${escapeAttr(f.inputType)}" formControlName="${f.key}"></mat-form-field>`,
    )
    .join("");
  return `<form [formGroup]="form">${controls}<button mat-button type="submit">Submit</button></form>`;
}

export const formProvider: Provider = {
  capability: "form",
  generate(feature: FeatureT): Asset[] {
    const fields = fieldsOf(feature.tree);
    const className = pascal(feature.id);
    const content = render(TEMPLATE, {
      selector: kebab(feature.id),
      className,
      fields,
      body: renderBody(fields),
    });
    return [{ path: `components/${className}.ts`, content, durable: false }];
  },
};
