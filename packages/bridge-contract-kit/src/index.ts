import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Asset, Bridge } from "@boyscout/schemas";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

/** Plain-TS options (fetch clients etc.) — the Astryx seam profile. */
export const PLAIN_TS_OPTS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
};

/** Angular options (decorators + DOM libs) — the Material seam profile. */
export const ANGULAR_OPTS: ts.CompilerOptions = {
  ...PLAIN_TS_OPTS,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
};

export interface SeamFixture {
  label: string;
  assets: Asset[];
  /** Human logic whose type drifts from the contract; written at the durable stub's own path. */
  driftedContent: string;
}

/**
 * Registry contract: identity, provider resolution, post-rule count, and a
 * bridge-supplied catalog self-verification. Called at a test file's top level.
 */
export function runRegistryContract(
  bridge: Bridge,
  opts: {
    expectedId: string;
    expectedPlatform: string;
    capabilities: readonly string[];
    minPostRules: number;
    verifyCatalog: () => void | Promise<void>;
  },
): void {
  describe(`${opts.expectedId} registry contract`, () => {
    it("declares identity and resolves a provider per capability", () => {
      expect(bridge.id).toBe(opts.expectedId);
      expect(bridge.platform).toBe(opts.expectedPlatform);
      for (const cap of opts.capabilities) {
        expect(bridge.registry.providerFor(cap)?.capability).toBe(cap);
      }
      expect(bridge.registry.providerFor("nope")).toBeUndefined();
    });
    it("carries at least the required post-barrier rules", () => {
      expect(bridge.postRules.length).toBeGreaterThanOrEqual(opts.minPostRules);
    });
    it("self-verifies its catalog against the real framework", async () => {
      await opts.verifyCatalog();
    });
  });
}

/**
 * Seam contract (D2d): the generated scaffold pins the human logic — the
 * generated durable stub compiles (0 diagnostics), a drifted stub does not.
 * Temp fixtures are written under `pkgRoot` so framework types resolve via
 * upward node_modules lookup.
 */
export function runSeamContract(opts: {
  pkgRoot: string;
  compilerOptions: ts.CompilerOptions;
  fixtures: SeamFixture[];
}): void {
  const tmps: string[] = [];
  const diagnose = (
    scaffold: { path: string; content: string },
    stub: { path: string; content: string },
  ): readonly ts.Diagnostic[] => {
    const dir = mkdtempSync(join(opts.pkgRoot, ".contract-tmp-"));
    tmps.push(dir);
    const scaffoldPath = join(dir, ".running", scaffold.path);
    const stubPath = join(dir, "src", stub.path);
    mkdirSync(dirname(scaffoldPath), { recursive: true });
    mkdirSync(dirname(stubPath), { recursive: true });
    writeFileSync(scaffoldPath, scaffold.content);
    writeFileSync(stubPath, stub.content);
    const program = ts.createProgram([scaffoldPath, stubPath], opts.compilerOptions);
    return ts.getPreEmitDiagnostics(program);
  };

  describe("seam contract: matching stub compiles, drifted stub fails (D2d)", () => {
    afterEach(() => {
      while (tmps.length) rmSync(tmps.pop() as string, { recursive: true, force: true });
    });
    for (const fx of opts.fixtures) {
      const scaffold = fx.assets.find((a) => !a.durable);
      const stub = fx.assets.find((a) => a.durable);
      it(`${fx.label} — generated stub satisfies the generated contract`, () => {
        if (!scaffold || !stub) throw new Error(`fixture "${fx.label}" needs scaffold + durable stub`);
        expect(diagnose(scaffold, stub)).toHaveLength(0);
      });
      it(`${fx.label} — a drifted stub is a compile error`, () => {
        if (!scaffold || !stub) throw new Error(`fixture "${fx.label}" needs scaffold + stub`);
        // Reuse the durable stub's real path so the scaffold's import resolves; only the type drifts.
        expect(diagnose(scaffold, { path: stub.path, content: fx.driftedContent }).length).toBeGreaterThan(0);
      });
    }
  });
}
