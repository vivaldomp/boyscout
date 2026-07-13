import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("../", import.meta.url));
const tmps: string[] = [];
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
});

// Angular-flavored options: decorators on, declaration-only compile against real @angular types.
const ANGULAR_OPTS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};

function diagnose(
  scaffold: { path: string; content: string },
  stub: { path: string; content: string },
): readonly ts.Diagnostic[] {
  const dir = mkdtempSync(join(pkgRoot, ".smoke-tmp-"));
  tmps.push(dir);
  const scaffoldPath = join(dir, ".running", scaffold.path);
  const stubPath = join(dir, "src", stub.path);
  mkdirSync(dirname(scaffoldPath), { recursive: true });
  mkdirSync(dirname(stubPath), { recursive: true });
  writeFileSync(scaffoldPath, scaffold.content);
  writeFileSync(stubPath, stub.content);
  const program = ts.createProgram([scaffoldPath, stubPath], ANGULAR_OPTS);
  return ts.getPreEmitDiagnostics(program);
}

const scaffold = {
  path: "http/UsersApi.service.ts",
  content: `import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map, type Observable } from "rxjs";
import { usersApiTransforms } from "../../src/http/users-api.transforms.js";

export interface UsersApiTransforms {
  getUsers(raw: unknown): string[];
}

const transforms: UsersApiTransforms = usersApiTransforms;

@Injectable({ providedIn: "root" })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getUsers(): Observable<string[]> {
    return this.http.request<unknown>("GET", "/users").pipe(map((raw) => transforms.getUsers(raw)));
  }
}
`,
};

describe("Angular seam typechecks under bare tsc (spike)", () => {
  it("matching stub compiles with zero diagnostics", () => {
    const stub = {
      path: "http/users-api.transforms.ts",
      content: `export const usersApiTransforms = {
  getUsers(raw: unknown): string[] {
    throw new Error("not implemented");
  },
};
`,
    };
    expect(diagnose(scaffold, stub)).toHaveLength(0);
  });

  it("a drifted return type is a compile error", () => {
    const drift = {
      path: "http/users-api.transforms.ts",
      content: `export const usersApiTransforms = {
  getUsers(raw: unknown): number {
    throw new Error("not implemented");
  },
};
`,
    };
    expect(diagnose(scaffold, drift).length).toBeGreaterThan(0);
  });
});
