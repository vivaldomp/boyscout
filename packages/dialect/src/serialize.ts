import type { AstNodeT, SpecificationT } from "@boyscout/schemas";
import type { DialectRegistry } from "./bind.js";

const INDENT = "  ";

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}

function literal(v: unknown): string {
  if (typeof v === "string") return `"${escapeString(v)}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v === null) return "null";
  throw new Error(`cannot serialize prop value of type ${typeof v}`);
}

function serializeNode(node: AstNodeT, depth: number, reg: DialectRegistry): string {
  const pad = INDENT.repeat(depth);
  const params = reg.paramsFor(node.type);
  const props = node.props ?? {};
  for (const k of Object.keys(props)) {
    if (!params.includes(k)) {
      throw new Error(
        `node "${node.type}" has prop "${k}" not in its parameter list [${params.join(", ")}]`,
      );
    }
  }
  // Positional args in param order, trimmed to the last present param (contiguous from index 0).
  let lastIdx = -1;
  params.forEach((p, i) => {
    if (p in props) lastIdx = i;
  });
  const args = params.slice(0, lastIdx + 1).map((p) => literal(props[p]));
  const argStr = args.length > 0 ? `(${args.join(", ")})` : "";

  const children = node.children ?? [];
  if (children.length === 0) return `${pad}${node.type}${argStr}`;
  const inner = children.map((c) => serializeNode(c, depth + 1, reg)).join("\n");
  return `${pad}${node.type}${argStr} {\n${inner}\n${pad}}`;
}

/** SpecificationT -> canonical .openui text (2-space indent, LF, trailing newline). Deterministic by construction. */
export function serializeOpenui(spec: SpecificationT, reg: DialectRegistry): string {
  const header = `spec version=${spec.version} bridge=${spec.metadata.bridge} platform=${spec.metadata.platform}`;
  const features = spec.features.map((f) => `${f.capability} ${f.id} =\n${serializeNode(f.tree, 1, reg)}`);
  return `${header}\n\n${features.join("\n\n")}\n`;
}
