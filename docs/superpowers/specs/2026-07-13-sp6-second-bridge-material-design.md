# SP6 — Second Bridge: Material/Angular (Agnosticism Proof) — Design

> Sub-project of BoyScout v1 (`docs/V1-ROADMAP.md`). SP6 stands up a clean, independent second bridge — `@boyscout/bridge-material` (Angular + Material Design) — that passes the **same Runtime contract suite** as the Astryx bridge, proving the generation Runtime knows no framework (**D1**, §14.1). It is the go-to-market marquee (**D7** — governed enterprise Angular). Builds on merged SP1 + SP2 + SP3 (needs both engine tiers: declarative + logic-bearing seam). Headless-only; the browser wireframe preview is deferred to SP6b.

## Goal

Deliver a second bridge that generates **governed Angular/Material** headlessly and passes a **shared, bridge-parametrized contract suite** byte-for-byte identical to the one the Astryx bridge passes. The agnosticism claim (D1) is proven *by construction*: the same assertions run against two frameworks, and the framework-agnostic Runtime is not modified at all.

## Scope

SP6 is purely additive with exactly three touch-points:

```
packages/bridges/bridge-material/     NEW — registry, providers, templates, guardrails, Angular seam
packages/bridge-contract-kit/         NEW — shared bridge-parametrized contract suite (test-only)
apps/cli/src/main.ts                  MODIFY — select bridge by config.bridge (astryx-react | material)
packages/runtime/                     UNTOUCHED — already agnostic; consumes any Bridge by interface
```

The Runtime already accepts a `Bridge` by interface (`generate({ config, bridge, specInput })`) and cross-checks `config.bridge === bridge.id` and `spec.metadata.{bridge,platform}` against the loaded bridge. SP6 changes zero runtime code; the only Astryx hardwiring in the repo is one import in `main.ts`.

### Capabilities

Material implements the FIRST-SPEC §13.2 capability set. Per §8.1 tiers:

| Capability | Tier | Seam? | Notes |
|---|---|---|---|
| `component` | declarative | no | standalone Angular component, inline template |
| `form` | declarative | no | standalone component holding a typed reactive `FormGroup` |
| `route` | declarative | no | exported Angular `Routes` array (lazy `loadComponent`) |
| `http` | **logic-bearing** | **yes** | `HttpClient` service scaffold + durable transforms stub (D2d) |

`http` is the only capability that exercises the seam-contract suite, so it is what proves the D2d scaffold↔logic seam is framework-agnostic in the Angular idiom. `form`/`route` are new declarative capability *types* (Astryx does not implement them), so their tests are Material-specific unit tests; only the shared **contract** assertions (registry shape + seam) are cross-bridge.

## Architecture — additive bridge, agnostic runtime unchanged

A Bridge is `{ id, platform, registry, postRules }` consumed by the Runtime purely by interface (`@boyscout/schemas`). Material mirrors Astryx's structure exactly, differing only in framework conventions expressed inside dumb Eta templates.

```
boyscout.config.yaml { platform: angular, bridge: material }
        │
   main.ts: selectBridge(config.bridge) ─▶ { "astryx-react": astryxBridge, "material": materialBridge }
        │
   runtime.generate({ config, bridge: materialBridge, specInput })   ← UNCHANGED runtime
        │  resolve → validate → plan → generate(providers) → format → verify(postRules) → emit
        ▼
   .running/ (disposable Angular scaffold)  +  src/ (durable human transforms, http only)
```

**Generation is pure text-templating.** Providers import no Angular runtime — they render Eta templates to strings, exactly as Astryx renders `.tsx` text without importing React. The only place `@angular/material` is referenced is the registry's self-verification (a dev-time resolution check, §"Registry"), never at generation time.

## Components

### `packages/bridges/bridge-material/`

```
src/
  index.ts               export const registry: BridgeRegistry; export const bridge: Bridge
  catalog.ts             COMPONENTS + node-type → { symbol, importPath } map into @angular/material
  naming.ts              kebab / camel / pascal (Angular file names, selectors, class names)
  params.ts              paramsFor(nodeType): ordered positional param names (SP4a DSL binding)
  component-provider.ts  Provider (capability "component") — declarative
  form-provider.ts       Provider (capability "form") — declarative
  route-provider.ts      Provider (capability "route") — declarative
  http-provider.ts       Provider (capability "http") — logic-bearing (scaffold + stub + httpSeam)
  material-only.ts       AssetRule — design-system enforcement (analog of astryxOnly)
templates/
  component.ts.eta  form.ts.eta  route.ts.eta  http.service.ts.eta  http.transforms.ts.eta
test/
  <bridge-specific unit + fixtures>; contract assertions imported from bridge-contract-kit
package.json  tsconfig.json
```

**`bridge`/`registry`:**

```ts
export const registry: BridgeRegistry = {
  capabilities: ["component", "form", "route", "http"],
  nodeTypesFor: (cap) => /* COMPONENTS | FORM_NODE_TYPES | ROUTE_NODE_TYPES | HTTP_NODE_TYPES | [] */,
  paramsFor,
  providerFor: (cap) => /* componentProvider | formProvider | routeProvider | httpProvider | undefined */,
};
export const bridge: Bridge = {
  id: "material",
  platform: "angular",
  registry,
  postRules: [materialOnly, biomeLint],   // biomeLint reused from @boyscout/guardrails
};
```

**Registry (self-verifiable, no Angular execution):** `catalog.ts` maps each Material node type to a real `@angular/material` symbol and its import subpath (e.g. `MatCard` from `@angular/material/card`). The contract suite verifies each entry **resolves** to a real export by module/subpath resolution + reading the published `.d.ts` — it does **not** `import` the component (which would execute Angular decorator/`@angular/core` code in the test runner). `@angular/material` (with its `@angular/core`, `@angular/common`, `rxjs` peers) is a `devDependency`.

**Providers** return `Asset[]`:
- Declarative (`component`, `form`, `route`): one disposable asset (`durable` falsy → `.running/`).
- `http` (logic-bearing): two assets — scaffold (`durable: false`) + transforms stub (`durable: true`) — plus a `httpSeam(feature): SeamContractT` describing `{ srcPath, typedSignature, binding }`, mirroring the Astryx http provider.

**Angular idioms (in templates only):**
- `component` → `@Component({ standalone: true, selector, imports: [...Mat*], template: \`...\` })`, PascalCase class, kebab file/selector.
- `form` → standalone component with a typed `FormGroup<{...}>` built via `NonNullableFormBuilder`; controls derived from AST children.
- `route` → `export const routes: Routes = [{ path, loadComponent: () => import(...) }, ...]`.
- `http` → `@Injectable({ providedIn: "root" })` service using `inject(HttpClient)`; typed methods return `Observable<T>` and delegate response parsing to the human transforms.

**Guardrails:** `postRules: [materialOnly, biomeLint]`. `materialOnly` flags any emitted component tag not present in the Material catalog (design-system enforcement, the analog of `astryxOnly`). `biomeLint` (reused) lints the generated TypeScript. Pre-generation restriction is enforced by the registry (`nodeTypesFor` bounds allowed node types), exactly as in Astryx.

### `packages/bridge-contract-kit/`

A **test-only** package exporting bridge-parametrized assertion runners, so "identical contract suite" holds by construction. It imports **no concrete bridge** (asserted by a self-check mirroring the runtime's `agnosticism.test.ts`).

```ts
// Registry contract — shape + self-verifiable catalog
export async function runRegistryContract(bridge: Bridge, opts: {
  expectedId: string;
  expectedPlatform: string;
  capabilities: readonly string[];   // each resolves a provider whose .capability matches; unknown cap → undefined
  minPostRules: number;              // >= 2 (design-system + lint)
  verifyCatalog: () => Promise<void>; // each catalog entry resolves to a real framework symbol
}): Promise<void>;

// Seam contract — scaffold pins human logic, drift → compile error (D2d)
export function runSeamContract(opts: {
  fixtures: Array<{
    generate: () => Asset[];         // provider.generate(feature) for a logic-bearing capability
    matchingStub: { path: string; content: string };  // human logic that satisfies the contract
    driftedStub: { path: string; content: string };   // human logic that violates it
  }>;
  compilerOptions: ts.CompilerOptions; // per-bridge tsc options (lib/types/decorators)
}): void;
```

`runSeamContract` reuses the existing `ts.createProgram` + `getPreEmitDiagnostics` harness: write scaffold under `.running/` + stub under `src/` into a temp dir inside the calling package, compile with `noEmit`, assert matching → 0 diagnostics and drifted → >0. This becomes the single copy of that harness.

**Retrofit — this is the proof, not overhead.** Astryx's existing `registry-contract.test.ts` and `seam-contract.test.ts` are rewritten as thin files that build Astryx's fixtures/options and call the kit runners; their assertions are preserved, just sourced from the shared kit. Material's contract tests do the same with Material's fixtures/options. Same assertions, two frameworks.

Per-bridge inputs (the only thing that differs):

| Input | Astryx | Material |
|---|---|---|
| catalog verify | `@astryxdesign/core` flat named exports | `@angular/material` subpath resolution + `.d.ts` (no decorator execution) |
| seam fixtures | service, store, http | http |
| tsc options | plain TS (fetch client) | Angular types + `experimentalDecorators`/`emitDecoratorMetadata` |

### `apps/cli/src/main.ts`

Replace the hardwired `import { bridge } from "@boyscout/bridge-astryx-react"` with a lookup keyed by `config.bridge`:

```ts
import { bridge as astryxBridge } from "@boyscout/bridge-astryx-react";
import { bridge as materialBridge } from "@boyscout/bridge-material";
const BRIDGES: Record<string, Bridge> = { "astryx-react": astryxBridge, material: materialBridge };
// after loadConfig:
const selected = BRIDGES[config.bridge];
if (!selected) { process.stderr.write(`unknown bridge: ${config.bridge}\n`); return 1; }
generate({ specInput, config, bridge: selected, outDir: dirname(specPath) });
```

The runtime's existing `config.bridge === bridge.id` and `spec.metadata` cross-checks then guard mismatches with no new code. `apps/cli/src/author/command.ts` continues to use the Astryx registry (authoring/preview stays React/Astryx per D1); routing the daemon to a bridge is not SP6.

## The Angular http seam & its one risk

**Mechanism (identical contract to Astryx http, Angular idiom):**
- Scaffold (`.running/http/<name>.service.ts`, disposable) declares `interface <Name>Transforms { <ep>(raw: unknown): <Response> }`, imports the human `<name>Transforms`, and binds `const transforms: <Name>Transforms = <name>Transforms;`. Each method: `this.http.get<unknown>(path).pipe(map((raw) => transforms.<ep>(raw)))`.
- Stub (`src/http/<name>.transforms.ts`, durable, create-if-absent) is the human transforms object, initially throwing.
- **Drift → compile error:** changing a human transform's return type breaks the `const transforms: <Name>Transforms = ...` binding under `tsc`.

**Risk:** unlike Astryx's plain-TS (fetch) scaffold, the Angular scaffold uses `@Injectable`, `inject(HttpClient)`, and `Observable`, so the seam runner must compile it with `@angular/core` + `@angular/common/http` + `rxjs` types resolvable and decorators enabled. Those types are present (peer deps of the `@angular/material` devDependency) and the kit already accepts per-bridge `compilerOptions`. The compile is declaration-only (`noEmit`) — no `@angular/compiler`, no bundler, no running app.

**Mitigation (spike first):** the first implementation task is a throwaway spike — generate one Angular http scaffold+stub and confirm `ts.createProgram` yields 0 diagnostics for the matching stub and >0 for the drifted stub with the Angular-flavored options. **Fallback (only if the spike forces it):** emit the `<Name>Transforms` interface into a plain-TS contract file the service imports; the seam drift-check then compiles the plain-TS contract + stub (framework-free), and the `@Injectable` service is generated but excluded from the drift-check.

## Determinism

Material generation uses the same primitives as Astryx (`render` via Eta, sorted keys via `byteCompare`) → byte-deterministic output. One golden fixture spec exercising all four capabilities joins the existing cross-OS golden mechanism (invariant #7). Not a new matrix — one Material fixture on the established path.

## Error handling

| Condition | Behaviour |
|---|---|
| `config.bridge` unknown to the CLI | stderr message → exit 1 (mirrors the existing unknown-command path) |
| `config.bridge` ≠ loaded `bridge.id` | existing runtime cross-check throws (no new code) |
| `spec.metadata.{bridge,platform}` ≠ bridge | existing runtime cross-check throws (no new code) |
| Emitted component tag not in Material catalog | `materialOnly` post-rule → gate violation (422) |
| Catalog entry not a real `@angular/material` symbol | `runRegistryContract` `verifyCatalog` fails in CI |
| Human transforms stub drifts from the generated contract | `tsc` compile error (seam-contract test proves it) |

## Testing

- **Shared contract suite (the proof):** Material runs `runRegistryContract` (id `material` / platform `angular`; all four capabilities resolve providers; ≥2 post-rules; catalog resolves against real `@angular/material`) and `runSeamContract` (http matching stub → 0 diagnostics, drifted → >0). Astryx retrofitted to the same runners and still green.
- **Per-provider unit tests:** component/form/route assert generated Angular structure (standalone `@Component`, typed `FormGroup`, `Routes` array) + attribute/text escaping; http asserts the two assets (scaffold non-durable / stub durable) and the `httpSeam` shape.
- **Guardrail test:** `materialOnly` flags a non-catalog tag; passes on a clean tree.
- **Determinism golden:** all-four-capabilities fixture generates byte-identical output on the existing cross-OS golden path.
- **CLI test:** `config.bridge: material` routes `generate` to the Material bridge; a mismatched `spec.metadata.bridge` fails the existing runtime cross-check (proves the guard already generalizes to a second bridge).
- **Kit hygiene:** `bridge-contract-kit` imports no concrete bridge (self-check).

## Non-goals (SP6)

- **Wireframe preview path** → SP6b (Material AST → Astryx structural wireframe in the SP4b/SP5b Renderer, §1.3 fidelity contract).
- **Bridge Skill** (agent-facing Angular conventions doc) → SP8, alongside `skill-template`.
- **`form`/`route` as logic-bearing** — both stay declarative (scaffold-only); no seam.
- **`service`/`store` capabilities** — not in Material's set; Angular DI-service / signal-store idioms are out of scope.
- **Any runtime change** — the Runtime is already agnostic; SP6 proves it, it does not modify it.
- **Full Angular app build / bundling** — generation emits governed source; compiling a runnable Angular app is not SP6.
- **`metadata.checksum` computation** — remains separately tracked/deferred (as in prior sub-projects).
