import { writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Hono } from "hono";
import { canonicalJson, writeBytes } from "@boyscout/determinism";
import { type DialectRegistry, serializeOpenui } from "@boyscout/dialect";
import type { SpecificationT } from "@boyscout/schemas";
import type { AuthAppOptions } from "./app.js";

function shieldWrite(target: string, root: string, bytes: Uint8Array): void {
  const abs = resolve(target);
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    throw new Error(`refusing to write outside project root: ${target}`);
  }
  writeFileSync(abs, bytes);
}

export function registerCommit(
  app: Hono,
  opts: AuthAppOptions,
  getSpec: () => SpecificationT | null,
  getApprovals: () => Record<string, boolean>,
  registry: DialectRegistry,
): void {
  app.post("/api/commit", (c) => {
    const spec = getSpec();
    const approvals = getApprovals();
    const violations: string[] = [];
    if (!spec) violations.push("no valid spec: fix parse/validation errors first");
    else for (const f of spec.features) if (!approvals[f.id]) violations.push(`feature ${f.id} not approved`);
    if (violations.length > 0) return c.json({ ok: false, violations }, 422);

    const s = spec as SpecificationT;
    shieldWrite(opts.specPath, opts.projectRoot, writeBytes(canonicalJson(s)));
    shieldWrite(opts.openuiPath, opts.projectRoot, writeBytes(serializeOpenui(s, registry)));
    return c.json({ ok: true, written: [opts.specPath, opts.openuiPath] });
  });
}
