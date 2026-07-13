import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const uiDist = resolve(here, "../dist");
const cliBin = resolve(repoRoot, "apps/cli/src/bin.ts");
const PORT = 4599;
const TOKEN = "e2e-fixed-token";
// `--import tsx` resolves the bare specifier relative to the child's cwd; the daemon/generate
// processes below run with cwd = a tmp project dir outside the monorepo, so it must be an
// absolute file:// URL to tsx's loader instead (ponytail: cwd-independent, not a package fix).
const tsxLoader = pathToFileURL(
  resolve(repoRoot, "apps/cli/node_modules/tsx/dist/loader.mjs"),
).href;

// The daemon reads a fixed token via env for deterministic E2E (see command.ts note below).
let daemon: ChildProcess;
let projectDir: string;

test.beforeAll(async () => {
  expect(existsSync(uiDist), "run `pnpm --filter boyscout-ui build` first").toBeTruthy();
  projectDir = mkdtempSync(join(tmpdir(), "bs-e2e-"));
  copyFileSync(join(here, "fixtures/seed.openui"), join(projectDir, "boyscout.openui"));
  copyFileSync(
    resolve(repoRoot, "apps/cli/test/fixtures/dialect-config.yaml"),
    join(projectDir, "boyscout.config.yaml"),
  );

  daemon = spawn(
    "node",
    [
      "--import",
      tsxLoader,
      cliBin,
      "author",
      "--openui",
      "./boyscout.openui",
      "--spec",
      "./boyscout-spec.json",
      "--port",
      String(PORT),
      "--ui-dist",
      uiDist,
    ],
    { cwd: projectDir, env: { ...process.env, BOYSCOUT_AUTH_TOKEN: TOKEN }, stdio: "inherit" },
  );
  // wait for the port to answer
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`http://127.0.0.1:${PORT}/`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20_000 },
    )
    .toBe(200);
});

test.afterAll(() => {
  daemon?.kill();
});

test("author -> preview -> approve -> commit -> generate", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/#t=${TOKEN}`);
  await expect(page.getByTestId("preview")).toContainText("Profile");
  // The checkbox is a controlled input whose onChange awaits an API round-trip before
  // approvals state (and thus the checked DOM prop) updates, so React's render resets the
  // native click's checked=true back to false in the same tick — `.check()` has no retry for
  // checkboxes and fails immediately on that flicker. click() + a polling assertion waits it out.
  await page.getByTestId("approve-user-card").click();
  await expect(page.getByTestId("approve-user-card")).toBeChecked();
  await page.getByTestId("commit").click();
  await expect(page.getByTestId("message")).toContainText("Wrote:");

  // spec.json now on disk
  const specPath = join(projectDir, "boyscout-spec.json");
  expect(existsSync(specPath)).toBeTruthy();

  // the existing CLI drives it to scaffolds
  const gen = spawnSync(
    "node",
    [
      "--import",
      tsxLoader,
      cliBin,
      "generate",
      "--spec",
      specPath,
      "--config",
      join(projectDir, "boyscout.config.yaml"),
    ],
    { cwd: projectDir, encoding: "utf8" },
  );
  expect(gen.status).toBe(0);
  expect(existsSync(join(projectDir, ".running/UserCard.tsx"))).toBeTruthy();
});

test("unsafe logic-bearing identifier is rejected at the gate", async () => {
  // Author a service with an illegal name directly through the daemon API; commit must not write.
  const bad = `spec version=1 bridge=astryx-react platform=react\n\nservice svc =\n  Service("Bad Name") {\n    Method("getX", "", "void")\n  }`;
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "content-type": "application/json",
    Origin: `http://127.0.0.1:${PORT}`,
  };
  const res = await fetch(`http://127.0.0.1:${PORT}/api/parse`, {
    method: "POST",
    headers,
    body: JSON.stringify({ text: bad }),
  });
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(JSON.stringify(body.errors)).toContain("unsafe identifier");
});
