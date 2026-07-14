import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CATALOG } from "./catalog.js";

const PKG_ROOT = fileURLToPath(new URL("../", import.meta.url));

/**
 * Self-verifiable registry: every catalog symbol must be a real export of its
 * @angular/material subpath. The check file is written to a real temp path under
 * the package so NodeNext resolution finds @angular/material via the package's own
 * node_modules (OS-agnostic). We resolve against the published .d.ts with tsc and
 * never import/execute Angular decorator code.
 */
export function verifyMaterialCatalog(): void {
  const lines = Object.values(CATALOG).map(
    (e, i) => `import type { ${e.symbol} as _${i} } from "${e.importPath}";`,
  );
  const dir = mkdtempSync(join(PKG_ROOT, ".verify-tmp-"));
  try {
    const checkFile = join(dir, "check.ts");
    writeFileSync(checkFile, lines.join("\n"));
    const program = ts.createProgram([checkFile], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    });
    const diags = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => d.code === 2307 || d.code === 2305 || d.code === 2724);
    if (diags.length > 0) {
      const msg = diags.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("; ");
      throw new Error(`material catalog self-verification failed: ${msg}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
