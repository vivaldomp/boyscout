import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { registry } from "@boyscout/bridge-astryx-react";
import { createAuthApp } from "./app.js";

function flag(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** `boyscout author --openui <f> [--spec <f>] [--host 127.0.0.1] [--port 4517] [--ui-dist <dir>]` */
export function authorCommand(argv: string[]): number {
  const openuiPath = resolve(flag(argv, "--openui", "./boyscout.openui"));
  const specPath = resolve(flag(argv, "--spec", "./boyscout-spec.json"));
  const host = flag(argv, "--host", "127.0.0.1");
  const port = Number(flag(argv, "--port", "4517"));
  const uiDist = resolve(
    flag(argv, "--ui-dist", fileURLToPath(new URL("../../../boyscout-ui/dist", import.meta.url))),
  );
  // BOYSCOUT_AUTH_TOKEN overrides the CSPRNG token for deterministic E2E only; unset in normal use.
  const token = process.env.BOYSCOUT_AUTH_TOKEN ?? randomBytes(24).toString("hex");
  const selfOrigin = `http://${host}:${port}`;
  const initialOpenui = existsSync(openuiPath) ? readFileSync(openuiPath, "utf8") : "";

  const { app } = createAuthApp({
    registry,
    token,
    selfOrigin,
    initialOpenui,
    specPath,
    openuiPath,
    projectRoot: process.cwd(),
  });

  // Static SPA, path-shielded to uiDist; unknown paths fall back to index.html (SPA routing).
  app.get("/*", (c) => {
    const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
    const abs = resolve(uiDist, rel);
    const indexHtml = resolve(uiDist, "index.html");
    const inside = abs === uiDist || abs.startsWith(uiDist + sep);
    const file = inside && existsSync(abs) ? abs : indexHtml;
    if (!existsSync(file))
      return c.text("boyscout-ui not built (run: pnpm --filter boyscout-ui build)", 500);
    const body = readFileSync(file);
    return new Response(body, {
      headers: { "content-type": MIME[extname(file)] ?? "application/octet-stream" },
    });
  });

  serve({ fetch: app.fetch, hostname: host, port });
  process.stdout.write(`boyscout author: open ${selfOrigin}/#t=${token}\n`);
  return 0;
}
