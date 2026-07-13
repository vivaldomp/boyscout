import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const uiDist = resolve(here, "../dist");
const cliBin = resolve(repoRoot, "apps/cli/src/bin.ts");
const PORT = 4601;
const TOKEN = "e2e-guided-token";
const tsxLoader = pathToFileURL(
  resolve(repoRoot, "apps/cli/node_modules/tsx/dist/loader.mjs"),
).href;

let daemon: ChildProcess;
let projectDir: string;

test.beforeAll(async () => {
  expect(existsSync(uiDist), "run `pnpm --filter boyscout-ui build` first").toBeTruthy();
  projectDir = mkdtempSync(join(tmpdir(), "bs-guided-"));
  copyFileSync(join(here, "fixtures/sample.questionnaire.yaml"), join(projectDir, "q.yaml"));

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
      "--questionnaire",
      "./q.yaml",
      "--port",
      String(PORT),
      "--ui-dist",
      uiDist,
    ],
    { cwd: projectDir, env: { ...process.env, BOYSCOUT_AUTH_TOKEN: TOKEN }, stdio: "inherit" },
  );
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

test("an incomplete answer set shows violations and does not seed", async ({ page }) => {
  // NOTE: must run BEFORE the happy-path test — it relies on the fresh, unseeded daemon session.
  await page.goto(`http://127.0.0.1:${PORT}/#t=${TOKEN}`);
  await expect(page.getByTestId("questionnaire-form")).toBeVisible();
  // no answer to the required single question -> violations, and nothing is seeded:
  await expect(page.getByTestId("violations")).toContainText("required");
  await expect(page.getByTestId("editor")).toHaveValue("");
  await expect(page.getByTestId("commit")).toBeDisabled();
});

test("questionnaire -> cascade -> stream -> annotate -> approve -> commit", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${PORT}/#t=${TOKEN}`);
  await expect(page.getByTestId("questionnaire-form")).toBeVisible();

  // answer the gating question -> the dependent question appears (enabledWhen cascade)
  await page.getByTestId("opt-screen-dashboard").click();
  await expect(page.getByTestId("opt-sections-header")).toBeVisible();
  // composed feature streamed to the preview
  await expect(page.getByTestId("preview")).toContainText("Overview");

  // add the header section -> its feature streams in too
  await page.getByTestId("opt-sections-header").click();
  await expect(page.getByTestId("preview")).toContainText("Header");

  // annotate the dashboard-grid feature root (pathKey "")
  await page.getByTestId("annotate-dashboard-grid-").fill("primary grid");

  // approve both composed features and commit
  await page.getByTestId("approve-dashboard-grid").click();
  await expect(page.getByTestId("approve-dashboard-grid")).toBeChecked();
  await page.getByTestId("approve-header-bar").click();
  await expect(page.getByTestId("approve-header-bar")).toBeChecked();
  await page.getByTestId("commit").click();
  await expect(page.getByTestId("message")).toContainText("Wrote:");

  // spec.json on disk carries both features and the annotation
  const spec = JSON.parse(readFileSync(join(projectDir, "boyscout-spec.json"), "utf8"));
  const ids = spec.features.map((f: { id: string }) => f.id).sort();
  expect(ids).toEqual(["dashboard-grid", "header-bar"]);
  const dash = spec.features.find((f: { id: string }) => f.id === "dashboard-grid");
  expect(dash.annotations[""]).toBe("primary grid");
});
