import ts from "typescript";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { CATALOG } from "./catalog.js";

/**
 * Self-verifiable registry: every catalog symbol must be a real export of its
 * @angular/material subpath. We resolve against the published .d.ts with tsc —
 * we do NOT `import` the components (that would execute Angular decorator code).
 */
export function verifyMaterialCatalog(): void {
  const lines = Object.values(CATALOG).map(
    (e, i) => `import type { ${e.symbol} as _${i} } from "${e.importPath}";`,
  );
  const source = lines.join("\n");
  const fileName = "verify-catalog.check.ts";

  // ponytail: Locate the project root from import.meta.url.
  // Resolve module paths in pnpm's store structure.
  const fileUrl = import.meta.url;
  const filePath = fileURLToPath(fileUrl);
  const projectRoot = filePath.split("/packages/")[0] ?? "/";

  const host = ts.createCompilerHost({});
  const original = host.getSourceFile.bind(host);

  host.getSourceFile = (name, langVersion, onError, shouldCreate) =>
    name === fileName
      ? ts.createSourceFile(name, source, langVersion, true)
      : original(name, langVersion, onError, shouldCreate);

  // ponytail: Custom module resolution for pnpm's store structure.
  // When TS looks for @angular/material, check pnpm .pnpm store.
  host.resolveModuleNames = (
    moduleNames,
    containingFile,
    _reusedNames,
    _redirectedReference,
    options,
  ) => {
    return moduleNames.map((moduleName) => {
      // Try standard resolution first
      const result = ts.resolveModuleName(
        moduleName,
        containingFile || path.join(projectRoot, "dummy.ts"),
        options,
        host,
      );
      if (result.resolvedModule) return result.resolvedModule;

      // Fallback: check pnpm .pnpm directory for @angular packages
      if (moduleName.startsWith("@angular/")) {
        const pnpmDir = path.join(projectRoot, "node_modules", ".pnpm");
        const dirs = fs.readdirSync(pnpmDir);
        const materialDir = dirs.find((d) => d.startsWith("@angular+material@"));
        if (materialDir) {
          const modulePath = path.join(
            pnpmDir,
            materialDir,
            "node_modules",
            moduleName,
            "index.d.ts",
          );
          if (fs.existsSync(modulePath)) {
            return {
              resolvedFileName: modulePath,
              isExternalLibraryImport: true,
            };
          }
        }
      }
      return undefined;
    });
  };

  const program = ts.createProgram(
    [fileName],
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      baseUrl: projectRoot,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
    },
    host,
  );
  const diags = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.code === 2307 || d.code === 2305 || d.code === 2724); // module/member not found
  if (diags.length > 0) {
    const msg = diags
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("; ");
    throw new Error(`material catalog self-verification failed: ${msg}`);
  }
}
