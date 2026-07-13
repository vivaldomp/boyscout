import { canonicalJson, hash, writeBytes } from "@boyscout/determinism";
import { DialectError, type DialectRegistry, parseOpenui } from "@boyscout/dialect";
import type { SpecificationT } from "@boyscout/schemas";
import { Hono } from "hono";

export interface AuthAppOptions {
  registry: DialectRegistry;
  token: string;
  selfOrigin: string;
  initialOpenui: string;
  /** Absolute, pre-resolved write targets (path-shielded at commit). */
  specPath: string;
  openuiPath: string;
  /** Absolute project root; commit writes must stay within it. */
  projectRoot: string;
}

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
}

export function createAuthApp(opts: AuthAppOptions): { app: Hono; snapshot: () => AuthState } {
  const { registry, token, selfOrigin } = opts;
  let openui = opts.initialOpenui;
  let spec: SpecificationT | null = null;
  let errors: { line: number; message: string }[] = [];
  let approvals: Record<string, boolean> = {};
  let sigs: Record<string, string> = {};

  function reparse(text: string): void {
    try {
      const next = parseOpenui(text, registry);
      const nextApprovals: Record<string, boolean> = {};
      const nextSigs: Record<string, string> = {};
      for (const f of next.features) {
        const s = hash(writeBytes(canonicalJson(f.tree)));
        nextSigs[f.id] = s;
        // carry approval only if this feature is byte-identical to the last good parse
        nextApprovals[f.id] = sigs[f.id] === s ? (approvals[f.id] ?? false) : false;
      }
      openui = text;
      spec = next;
      approvals = nextApprovals;
      sigs = nextSigs;
      errors = [];
    } catch (e) {
      errors = [{ line: e instanceof DialectError ? e.line : 0, message: (e as Error).message }];
      // keep the last good spec/approvals/sigs; update the visible text so the editor shows what was typed
      openui = text;
    }
  }
  // initial load: try to parse, but always retain the initial text even if it fails
  reparse(opts.initialOpenui);
  openui = opts.initialOpenui;

  const snapshot = (): AuthState => ({ openui, ast: spec, approvals, errors });

  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("Origin");
    if (origin && origin !== selfOrigin) return c.json({ error: "forbidden origin" }, 403);
    if (c.req.header("Authorization") !== `Bearer ${token}`)
      return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/api/state", (c) => c.json(snapshot()));

  app.post("/api/parse", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
    reparse(typeof body.text === "string" ? body.text : "");
    return c.json({ ok: errors.length === 0, ast: spec, errors });
  });

  app.post("/api/approve", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      featureId?: unknown;
      approved?: unknown;
    };
    const id = typeof body.featureId === "string" ? body.featureId : "";
    if (id in approvals) approvals[id] = body.approved === true;
    return c.json({ approvals });
  });

  // commit route added in Task 4 (needs writeBytes + path shielding)
  registerCommit(
    app,
    opts,
    () => spec,
    () => approvals,
    registry,
  );

  return { app, snapshot };
}

// TEMPORARY — replaced in Task 4 by ./commit.ts
function registerCommit(
  _app: Hono,
  _opts: AuthAppOptions,
  _getSpec: () => SpecificationT | null,
  _getApprovals: () => Record<string, boolean>,
  _registry: DialectRegistry,
): void {}
