# BoyScout — v1 Build Roadmap

> Ordered decomposition of the comprehensive v1 (see `FIRST-SPEC.md`, decisions **D1–D10**) into independently buildable sub-projects. Each sub-project gets its own spec → plan → build cycle.

## Ordering principle

**Front-load the thesis proof and the highest-risk pieces.** v1 is comprehensive (D8/D9/D10 pulled parallelism, the full authoring surface, and bidirectional DSL round-trip into scope), but the *order* retires the core risk first — so the project can be killed or rethought cheaply if the central bet (cross-OS byte-identity + headless governance) does not hold, before spending on the front-end, second bridge, and E2E.

## Ordered sub-projects

| SP | Goal | Key packages | Depends on | Proof it's done |
|---|---|---|---|---|
| **SP1** | **Foundations & Determinism Harness** | `schemas`, `determinism`, monorepo/pnpm/CI | — | Canonical-JSON + byte-writer produce **identical bytes on Linux/Mac/Windows** in CI; schemas validate sample specs |
| **SP2** | **Headless Declarative Generation** (walking skeleton = thesis proof) | `planner` (sequential), `codegen`, `guardrails`, `spec`, `runtime` (disposable emit), minimal `bridge-astryx-react` (Registry + `component` only), `cli-tools` + `apps/cli` (`boyscout generate`) | SP1 | Hand-authored `spec.json` → byte-identical `component` output on 3 OSes (golden CI); a guardrail violation **fails the gate (422)** |
| **SP3** | **Logic-Bearing Tier & Durable Seam** (headless) | `runtime` durable emit mode (D2b), `bridge-astryx-react` logic-bearing capabilities (service/store/http) + React-idiom seam (D2d) | SP2 | Scaffold → `.running/` + stub → `src/` (create-if-absent); **regen preserves human file**; **signature drift → compile error**; golden covers scaffold only |
| **SP4** | **Authoring Front-End** (DSL → preview → approve) + secure daemon | `dialect` (`.openui` parse + byte-stable **both-directions** round-trip, D10), Astryx `<Renderer/>`, `apps/boyscout-ui`, Hono HTTP + **§21 security** (CSPRNG session token, origin enforcement, loopback bind, path shielding) | SP1, SP2 | Author `.openui` → high-fidelity preview → approve → validated `spec.json` → generate; DSL round-trips byte-stable both ways |
| **SP5** | **Guided Authoring** (Questionnaire + SSE) | `questionnaire` (`enabledWhen`), SSE live workspace streaming | SP4 | Closed questionnaire drives composition; features stream via SSE to live preview; per-node annotations enrich context |
| **SP6** | **Second Bridge: Material/Angular** (agnosticism proof + go-to-market marquee) | `bridge-material` (Registry, Providers, Templates, Guardrails, Bridge Skill, Angular-idiom seam), wireframe preview path | SP2, SP3 | Material passes the **identical Runtime contract suite** as Astryx → agnosticism proven (D1); generates governed Angular |
| **SP7** | **Parallel Execution** (D8) | `planner`/`runtime` parallel scheduler + deterministic reassembly | SP2 | Parallel output **byte-identical to sequential** baseline; measurable speedup — *delivered as an **opt-in** `buildAssetsParallel` (default stays sequential); ~2.5× on format-heavy specs above the pool-init crossover; edge-handling proven with synthetic graphs pending a `Feature` dependency-data schema change* |
| **SP8** | **Full E2E, Skill, Lockfile & Hardening** | `skill-template`, Playwright E2E, `boyscout.lock` (transitive closure), matured cross-OS golden | all | Full agent → CLI → browser → approval → generate green in CI; lockfile reproducibility verified; §21 checklist met |

## Dependency shape

```
SP1 ─┬─> SP2 ─┬─> SP3 ─┐
     │        │        ├─> SP6 ─┐
     │        ├─> SP7  │        ├─> SP8
     └──────> SP4 ─> SP5 ───────┘
```

SP2 and SP4 are the two roots after foundations; SP3/SP7 hang off the engine (SP2), SP5 off the front-end (SP4), SP6 needs both engine tiers, SP8 gates everything.

## Kill-gate: SP2

After **SP1 + SP2**, if byte-identical cross-OS output **and** headless governance both hold, the core bet is proven and everything after is "build the specified surface." If either fails, the spend is ~2 sub-projects, not 8, before the architecture is reconsidered. Retiring the risk first, cheaply, is the entire payoff of this ordering.

## Deliberate ordering choice: SP3 before SP4

Logic-bearing capabilities are headless, so **SP3 (durable seam) precedes SP4 (authoring front-end)** — staying in cheap headless-engine mode and de-risking the hardest architecture (the seam) early. **Alternative:** flip SP3/SP4 to build the visual authoring loop first if an early stakeholder *demo* outweighs early de-risking. Both valid; engine-first is the recommendation.

## Notes

- Each sub-project is independently spec'd, planned, and built. This document is the sequencing contract, not a design — designs live per sub-project.
- Security (§21) is **not** deferred to SP8: it lands in **SP4**, the moment the daemon first serves HTTP/SSE.
- Parallelism (SP7) is intentionally late: it is an optimization over an already-correct sequential executor (SP2), so the sequential golden baselines prove parallelism changed no bytes.
