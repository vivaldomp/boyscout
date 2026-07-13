import { canonicalJson, hash, writeBytes } from "@boyscout/determinism";
import { DialectError, type DialectRegistry, parseOpenui } from "@boyscout/dialect";
import type { AstNodeT, QuestionnaireT, SpecificationT } from "@boyscout/schemas";
import { Hono } from "hono";
import { registerCommit } from "./commit.js";
import { registerGuided } from "./guided.js";

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
  /** When set, guided-authoring routes serve this questionnaire. */
  questionnaire?: QuestionnaireT;
}

export interface AuthState {
  openui: string;
  ast: SpecificationT | null;
  approvals: Record<string, boolean>;
  errors: { line: number; message: string }[];
  annotations: Record<string, Record<string, string>>;
}

export function createAuthApp(opts: AuthAppOptions): { app: Hono; snapshot: () => AuthState } {
  const { registry, token, selfOrigin } = opts;
  let openui = opts.initialOpenui;
  let spec: SpecificationT | null = null;
  let errors: { line: number; message: string }[] = [];
  let approvals: Record<string, boolean> = {};
  let sigs: Record<string, string> = {};
  let annotations: Record<string, Record<string, { note: string; sig: string }>> = {};

  const nodeAtPath = (tree: AstNodeT, pathKey: string): AstNodeT | undefined => {
    if (pathKey === "") return tree;
    if (!/^\d+(\.\d+)*$/.test(pathKey)) return undefined;
    let node: AstNodeT | undefined = tree;
    for (const seg of pathKey.split(".")) node = node?.children?.[Number(seg)];
    return node;
  };
  const nodeSig = (node: AstNodeT): string => hash(writeBytes(canonicalJson(node)));
  const notesAll = (): Record<string, Record<string, string>> => {
    const out: Record<string, Record<string, string>> = {};
    for (const [fid, map] of Object.entries(annotations)) {
      const notes: Record<string, string> = {};
      for (const [k, v] of Object.entries(map)) notes[k] = v.note;
      out[fid] = notes;
    }
    return out;
  };

  function reparse(text: string): void {
    if (text.trim() === "") {
      openui = "";
      spec = null;
      approvals = {};
      sigs = {};
      annotations = {};
      errors = [];
      return;
    }
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
      // carry each annotation only if the node at its path still hashes the same
      const nextAnnotations: typeof annotations = {};
      for (const f of next.features) {
        const existing = annotations[f.id];
        if (!existing) continue;
        const kept: Record<string, { note: string; sig: string }> = {};
        for (const [pathKey, ann] of Object.entries(existing)) {
          const node = nodeAtPath(f.tree, pathKey);
          if (node && nodeSig(node) === ann.sig) kept[pathKey] = ann;
        }
        if (Object.keys(kept).length > 0) nextAnnotations[f.id] = kept;
      }
      openui = text;
      spec = next;
      approvals = nextApprovals;
      sigs = nextSigs;
      annotations = nextAnnotations;
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

  const snapshot = (): AuthState => ({
    openui,
    ast: spec,
    approvals,
    errors,
    annotations: notesAll(),
  });

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

  app.post("/api/annotate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      featureId?: unknown;
      path?: unknown;
      note?: unknown;
    };
    const featureId = typeof body.featureId === "string" ? body.featureId : "";
    const path = typeof body.path === "string" ? body.path : "";
    const note = typeof body.note === "string" ? body.note : "";
    const feature = spec?.features.find((f) => f.id === featureId);
    const node = feature ? nodeAtPath(feature.tree, path) : undefined;
    if (feature && node) {
      const map = (annotations[featureId] ??= {});
      if (note === "") delete map[path];
      else map[path] = { note, sig: nodeSig(node) };
      if (Object.keys(map).length === 0) delete annotations[featureId];
    }
    return c.json({ annotations: notesAll()[featureId] ?? {} });
  });

  registerGuided(
    app,
    registry,
    () => opts.questionnaire,
    (text) => reparse(text),
  );

  // commit route added in Task 4 (needs writeBytes + path shielding)
  registerCommit(
    app,
    opts,
    () => spec,
    () => approvals,
    () => annotations,
    registry,
  );

  return { app, snapshot };
}
