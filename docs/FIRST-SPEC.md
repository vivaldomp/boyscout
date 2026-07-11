# BoyScout

> **Governed Deterministic Runtime** for **Software Generation**.
> Organizations encode their engineering standards in **Bridges, Providers, Templates, and Guardrails**; the Runtime executes them with byte-for-byte reproducibility. AI decides **what** to build — the Runtime decides **how**.

---

## 0. Hardening Decisions (Pressure-Test, 2026-07-11)

This document has been hardened through an architectural pressure-test. The decisions below are **authoritative** and are reflected in the sections that follow; where an older passage conflicts, these govern.

| # | Decision |
|---|---|
| **D1** | The Astryx/React `<Renderer/>` is **core authoring-stage infrastructure**, built first. The **generation Runtime stays framework-agnostic** (§14.1 scoped to it explicitly). **React/Astryx is the first-built platform**; **Material/Angular is the proof-of-agnosticism bridge**, built second. Agnosticism is proven by Material alone. Material previews are honest structural wireframes. |
| **D2a** | Non-visual capabilities are **scaffolding generators, not logic generators**. Two capability tiers: **declarative** (component, form, route, http-as-wiring) and **logic-bearing** (service, store, http-with-transforms). Responsibility splits three ways: **AI = what**, **Runtime = how-of-construction**, **human = how-of-behavior**. |
| **D2b** | `emit()` has **two modes**: disposable overwrite → `.running/`, and **durable create-if-absent → `src/`**. The determinism guarantee covers `.running/` only; durable `src/` human artifacts are outside it. |
| **D2c** | **Merge / protected-region codegen is a non-goal** — it would make output depend on prior file contents and break determinism. The seam is always two files with a typed contract. |
| **D2d** | The generated-scaffold ↔ human-logic **seam is a Bridge contract clause**, implemented idiomatically per framework, tested by the §20 Runtime contract suite (regen preserves the human file; signature drift → compile error; post-guardrails verify contract + lint). Governance is **provable for the scaffold, lint-level for human logic bodies**. |
| **D3a** | Determinism is an **enforced subsystem, not a convention**: a core primitives module (canonical-JSON, byte-collation sort, hermetic formatter, byte-writer) is the only sanctioned path for serialize/sort/format/write. |
| **D3b** | Byte-for-byte identity is **cross-OS** (Linux/Mac/Windows), given spec + `boyscout.lock`, **proven by multi-OS golden-file CI**. The formatter is the long-pole risk. |
| **D4** | **Incremental execution + content-addressable caching are cut from v1** (output is disposable and regenerated wholesale in milliseconds). Deferred optimization — add when generation is *measurably* slow. Replayability and inspectability of the Execution Graph are retained. |
| **D5** | **Test proportionality:** v1 = golden-file determinism (the thesis) + seam contract tests + Guardrail 422 tests + Registry contract tests. **Full agent→browser E2E is *in* v1** (the full authoring surface exists to test it — see **D9**). **Parser fuzzing remains deferred** — the DSL round-trip guarantee (**D10**) is carried by property tests in v1; fuzzing is later hardening. |
| **D6** | **"Model independence" reframed:** the guarantee is *reproducibility given a Specification* and *governance that holds regardless of model* — **not** identical output across different models (different model → different valid spec → different valid output). |
| **D7** | **Go-to-market marquee = Material/Angular** (governed enterprise Angular: the §16/§19.1 story). **React/Astryx is the technical foundation + high-fidelity reference**, built first (**D1**) but not the headline. Build-primary ≠ marquee. |
| **D8** | **Parallel execution is *in* v1.** The Execution Graph runs nodes in parallel within dependency bounds, with **deterministic reassembly to graph order before emit** (§11.3). Note: this is a *single-run* speedup; D4's *cross-run* caching/incremental stay **out** (independent axes). |
| **D9** | **Full authoring surface is *in* v1:** closed questionnaire engine (`@boyscout/questionnaire`, `enabledWhen`) + SSE live workspace + Renderer preview + approval gate (§18 as written). This pulls full E2E into v1 (**D5**). |
| **D10** | **Full byte-stable DSL round-trip is *in* v1.** `.openui` DSL files are **persisted, first-class, human-editable artifacts**; `parse → bind → validate → serialize` is byte-stable **both directions** and determinism-covered (**D3a**). Source-of-truth reconciliation: the **AST is canonical**; `boyscout-spec.json` is its authoritative persisted form (the generation source of truth); `.openui` is a byte-stable editable projection kept in lockstep by the round-trip guarantee. |

---

## 1. Concept and Positioning

**BoyScout** is a **Governed Deterministic Runtime** — not an AI code generator, not an Angular generator, not a React generator. It is an **Enterprise Software Governance Engine** that treats code generation as one of many deterministic execution capabilities.

The core philosophy:

> **Specification before code. Standards above model freedom. Governance is the product.**

The value proposition is not "generates components" but rather:

- organizations encode their engineering standards in **Bridges** (design systems, conventions, imports, tokens, architecture), **Templates**, and **Guardrails**;
- any compatible agent (Claude Code, Codex, Copilot, Gemini) executes these standards consistently;
- **changing the AI model never requires rewriting the generation logic** — the model only decides composition;
- **new stacks and design systems are added via configuration**, without modifying the Runtime;
- **identical inputs always produce identical outputs** — byte-for-byte reproducibility is a guarantee, not an aspiration.

### 1.1. The Paradigm: AI Decides the What, Not the How

The market standard (`Prompt → LLM → Code`) depends on model, version, prompt, temperature, and context — producing non-deterministic output. BoyScout inverts this:

```
Intent → Skill → Specification → Planner → Execution Graph → Governed Runtime →
Bridge → Providers → Templates → Formatter → Guardrails → Tests → Assets
```

AI participates only up to the **Specification** (deciding composition). Everything after is deterministic and reproducible: same Specification + same Bridge version + same Runtime version ⇒ **same output bytes**.

### 1.2. Two Stages: Authoring and Generation

- **Design-gate (authoring front-end):** design conversation → DSL → browser preview → human approval → **produces** `boyscout-spec.json`. Covers the **visual Capabilities** (component, form, route/screen). Its rendering foundation is **React/Astryx + the `<Renderer/>`** — core authoring-stage infrastructure (**D1**).
- **Governed Runtime (generation backend):** **consumes** the validated Specification and runs the Runtime Protocol (`load → resolve → plan → validate → generate → format → verify → emit`). **Framework-agnostic — never imports React nor the `<Renderer/>`.** Covers **all** Capabilities — including **non-visual** ones (service, http, store), generated headless. Per **D2a**, non-visual capabilities are **scaffolding generators, not logic generators**: they emit standards-conformant structure with explicit typed logic-holes (see §8, §10, §22).

> **Two distinct cores (D1).** The *authoring stage* is founded on React/Astryx; the *generation Runtime* is framework-agnostic. The framework-agnosticism invariant (§14.1) governs the generation Runtime only. The Renderer maps the *generic* AST and never learns a target framework.

The `boyscout-spec.json` is the versioned source of truth; generated scaffolds in `.running/` are a reproducible and **disposable** build artifact. Logic-bearing capabilities additionally have a durable, human-owned `src/` layer (**D2b**).

### 1.3. Preview Fidelity Contract (Bridge-Dependent)

The browser preview is rendered in React (via OpenUI-lang's `<Renderer/>` + Astryx components), from the **same AST** that feeds generation. Visual fidelity depends on the **target Bridge**:

- **Astryx/React Bridge:** preview ≈ output (same design system) → **high fidelity**.
- **Material Design/Angular Bridge:** preview is a **structural approximation (wireframe)** — Astryx approximates the layout, but final appearance is guaranteed by the Bridge's design system in generation, not by the preview.

What **always** matches between preview and output is the **structure** (tree, hierarchy, content, order, per-node annotations) — never necessarily the pixels. The human approves structure + content + annotations; the final appearance is the responsibility of the Bridge's design system.

---

## 2. Architecture Overview

### 2.1. Layered Architecture (Agnostic Runtime)

The Runtime **knows neither Angular nor React**. It knows only how to execute protocol stages. All framework knowledge lives exclusively in **Bridges**.

```
                          ┌─────────────────────────┐
                          │        Intent            │  natural language
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │         Skill            │  context + pre-Guardrails
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │     Specification        │  boyscout-spec.json
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │        Planner           │  deterministic planning
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │    Execution Graph       │  dependency DAG
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │   Governed Runtime       │  protocol orchestration
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │        Bridge            │  framework + design system
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │       Providers          │  capability implementations
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │       Templates          │  dumb interpolation
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │       Formatter          │  byte-stable formatting
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │      Guardrails          │  post-generation enforcement
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │         Tests            │  verification
                          └────────────┬────────────┘
                                       ▼
                          ┌─────────────────────────┐
                          │        Assets            │  emitted files (.ts, .html, …)
                          └────────────┴────────────┘
```

### 2.2. Structural Hierarchy

Every concept in BoyScout follows a strict hierarchy:

```
Runtime   → the agnostic orchestrator (knows no frameworks)
  ↓
Bridge    → binding of a Platform to the Runtime (owns all framework knowledge)
  ↓
Platform  → the target framework ecosystem (Angular, React, …)
  ↓
Assets    → emitted files (disposable, reproducible)
```

Angular, React, or any other framework always appears as **an implementation behind a Bridge** — never as a central concept of the system.

---

## 3. Terminology and Definitions

To ensure architectural clarity, every concept has one precise definition:

| Term | Definition |
|---|---|
| **Runtime** | The agnostic orchestrator that executes the Runtime Protocol. Never contains framework knowledge. |
| **Bridge** | A complete binding of a Platform to the Runtime. Owns: Registry, Providers, Capabilities, Templates, Guardrails, and Bridge Skill. |
| **Platform** | The target framework ecosystem (Angular, React, Vue, etc.). Exists only inside a Bridge. |
| **Capability** | A generation unit (component, form, route, http, store, service). Defined by the Registry, implemented by Providers. |
| **Provider** | An internal module of a Bridge that implements one or more Capabilities. |
| **Registry** | The typed catalog of available Capabilities, their schemas, inputs, outputs, validators, and constraints. |
| **Skill** | A thin context layer that composes Bridge Skill fragments and injects them into the agent's context. Follows the [agentskills.io](https://agentskills.io) specification standard. |
| **Bridge Skill** | A knowledge fragment packaged inside a Bridge. Teaches the agent the conventions, imports, tokens, architecture, and naming of that specific Bridge. Does not execute code. |
| **Planner** | The deterministic module that converts a validated Specification into an Execution Graph. |
| **Execution Graph** | The deterministic dependency DAG produced by the Planner. Defines execution order, dependencies, and parallelism boundaries. |
| **Specification** | The validated, versioned software contract (`boyscout-spec.json`). The single source of truth for *what is generated*; the only editable artifact for the **declarative** tier. Logic-bearing capabilities also have a durable human-owned `src/` layer (**D2a/D2b**). |
| **Template** | A dumb interpolation file (Eta). Contains zero business logic. All decisions live in the Planner/Registry/Guardrails. |
| **Guardrail** | An enforcement rule (pre or post-generation). Rules are defined by Bridges and parameterized in configuration. |
| **Asset** | An emitted file (`.ts`, `.html`, `.css`, …). Always disposable. Always reproducible. |
| **Formatter** | A fixed-version formatting stage that produces byte-stable, idempotent output. |

### 3.1. Skill vs. Bridge Skill — Pipeline Participation

```
Agent ←── Skill ←── Bridge Skill (fragments)
  │
  ▼
Specification ──→ Planner ──→ Execution Graph ──→ Runtime ──→ Bridge ──→ Assets
```

- **Skill**: lives at the agent layer. Composes fragments from one or more Bridge Skills. Injects context and pre-Guardrails into the agent conversation. Does not participate in generation.
- **Bridge Skill**: lives inside a Bridge. Provides knowledge about conventions, imports, tokens, architecture, and naming patterns for that specific Bridge. Is consumed by the Skill, not by the Runtime.
- **Bridge**: lives at the Runtime layer. Owns Providers, Templates, Registry, and Guardrails. Participates directly in generation.
- **Runtime**: orchestrates the protocol stages. Never reads Bridge Skills. Never contains framework knowledge.

---

## 4. The Specification

The Specification (`boyscout-spec.json`) is the central artifact of BoyScout:

- **The approved software contract**: represents the validated, human-approved design of screens and features.
- **The only editable artifact (declarative tier)**: for declarative capabilities, all changes flow through Specification modifications, never through direct code editing. Logic-bearing capabilities additionally have a durable human-owned `src/` logic layer (**D2a/D2b**) — the spec owns its *shape*, humans own its *behavior*.
- **The immutable source of truth**: once approved, the Specification is the single authority for *what* should be generated.
- **The reproducible input to generation**: same Specification + same versions ⇒ same output bytes in `.running/` (**D3b**).

Generated **scaffolds** (`.running/`) are always a **disposable artifact**. The Specification is the durable engineering artifact that should be versioned, reviewed, and maintained — alongside the durable `src/` logic layer for logic-bearing capabilities.

### 4.1. Specification Schema

```
boyscout-spec.json
├── version          → Specification schema version
├── features[]       → feature definitions
│   ├── id           → stable feature identifier
│   ├── capability   → target Capability (component, form, route, …)
│   ├── tree         → AST of the visual/structural design
│   ├── annotations  → per-node metadata ({nodeId: text})
│   ├── props        → resolved inputs for the Capability
│   └── approved     → boolean — human approval flag
└── metadata
    ├── bridge       → Bridge identifier and version
    ├── platform     → Platform identifier
    └── checksum     → integrity hash
```

---

## 5. The Planner

The Planner is the deterministic module that converts a validated Specification into an Execution Graph. It is **not** a stochastic component — by the time the Planner runs, all AI decisions have already been made.

### 5.1. Responsibilities

- Parse the validated Specification and resolve all Capability references against the Registry.
- Determine the set of Assets to generate and their dependencies.
- Produce a deterministic Execution Graph with explicit ordering.
- Ensure every node in the graph maps to exactly one Capability execution.

### 5.2. Inputs

| Input | Source |
|---|---|
| Validated Specification | `boyscout-spec.json` (passed validation gate) |
| Runtime Configuration | `boyscout.config.yaml` |
| Registry | Loaded from the active Bridge |
| Bridge Metadata | Version, Capabilities, constraints |

### 5.3. Outputs

The Planner produces a single artifact: the **Execution Graph** — a directed acyclic graph (DAG) of generation steps, fully resolved and deterministically ordered.

### 5.4. Deterministic Guarantees

- Same inputs always produce the same Execution Graph.
- No randomness, no sampling, no model inference.
- The planning algorithm uses topological sorting with stable tie-breaking (lexicographic by Capability ID).
- The Execution Graph is serializable and inspectable.

---

## 6. The Execution Graph

The Execution Graph is the deterministic dependency DAG produced by the Planner. It is the precise instruction set that the Runtime executes.

### 6.1. Structure

- **Nodes**: each node represents a single generation step — one Capability execution producing one or more Assets.
- **Edges**: directed dependencies between nodes. A node executes only after all its dependencies have completed.
- **Ordering**: topological sort with deterministic tie-breaking ensures identical execution order across runs.

### 6.2. Properties

| Property | Description |
|---|---|
| **Deterministic scheduling** | Same graph always executes in the same order. |
| **Parallel execution** *(v1, D8)* | Independent nodes run concurrently within dependency bounds; outputs are **reassembled to graph order before emit** (§11.3), so parallelism never affects output bytes. Single-run speedup only. |
| **Replayability** | The graph can be serialized, stored, and re-executed to reproduce identical output. |
| **Inspectability** | The graph can be visualized and audited before execution. |
| **Incremental execution** *(deferred, D4)* | *Not in v1.* Future optimization: re-execute only changed nodes. v1 regenerates `.running/` wholesale — fast enough that caching is unwarranted. |
| **Content-addressable caching** *(deferred, D4)* | *Not in v1.* Future optimization: identical node inputs skip execution. Add when generation is *measurably* slow. |

### 6.3. Example

```
[route: /users]
    ├── [component: user-list]
    │       ├── [service: user-service]
    │       │       └── [http: get-users]
    │       └── [component: user-card]
    └── [component: user-detail]
            └── [form: user-edit-form]
```

Each node is fully resolved: Capability, Provider, Template, inputs, and expected outputs.

---

## 7. Runtime Protocol

The Runtime executes a stable protocol with defined stages. Every stage has a clear contract.

```
load() → resolve() → plan() → validate() → generate() → format() → verify() → emit()
```

### 7.1. Stage Contracts

| Stage | Input | Output | Contract |
|---|---|---|---|
| **`load()`** | `boyscout.config.yaml` | Runtime configuration, Bridge reference | Load and parse the project configuration. Fail fast on invalid config. |
| **`resolve()`** | Bridge reference | Loaded Bridge (Registry, Providers, Templates, Guardrails, Bridge Skill) | Resolve and load the Bridge and all its dependencies. Verify version compatibility. |
| **`plan()`** | Validated Specification + Registry + Configuration | Execution Graph | Produce the deterministic Execution Graph. No stochastic operations. |
| **`validate()`** | Execution Graph + Registry + Pre-Guardrails | Validated Execution Graph or 422 failure | Run pre-generation Guardrails against the graph. Reject invalid compositions. |
| **`generate()`** | Validated Execution Graph + Providers + Templates | Raw Assets | Execute each node: Provider selects Template, Template produces raw output. |
| **`format()`** | Raw Assets + Formatter config | Formatted Assets | Apply fixed-version formatter. Output is byte-stable and idempotent. |
| **`verify()`** | Formatted Assets + Post-Guardrails + Tests | Verified Assets or 422 failure | Run post-generation Guardrails (AST/lint), tests, and validation. Block on violation. |
| **`emit()`** | Verified Assets | Files on disk | **Two modes (D2b):** (a) *disposable* — overwrite generated scaffolds into `.running/`, idempotent; (b) *durable* — for logic-bearing capabilities, **create-if-absent** the human-owned logic stub into `src/`, **never overwriting** an existing file. No path traversal. |

### 7.2. Invariants

- Every stage is a pure function of its inputs (no side effects until `emit()`).
- The pipeline is fail-fast: any stage failure halts execution with a structured error.
- The Runtime never inspects Asset content for framework-specific patterns.

---

## 8. Capability Registry

The Registry is the typed catalog of everything the system can generate. It is the **contract between the Specification and the generation pipeline**.

### 8.1. Capability Schema

Each Capability in the Registry defines:

| Field | Description |
|---|---|
| **`id`** | Unique Capability identifier (e.g., `component`, `form`, `http`). |
| **`version`** | Capability schema version. |
| **`tier`** | `declarative` or `logic-bearing` (**D2a**). Declarative capabilities (component, form, route, http-as-wiring) are fully spec-derived and disposable. Logic-bearing capabilities (service, store, http-with-transforms) additionally declare a durable-seam contract. |
| **`inputs`** | Typed input schema (Zod 4). Defines what the Specification can express for this Capability. |
| **`outputs`** | Expected Asset types and naming conventions. |
| **`seam`** | *(logic-bearing only, D2d)* The durable-artifact contract: the `src/` path (stable, spec-derived), the typed signatures the human logic must satisfy (compiler-enforced), and how the generated scaffold binds to it. The **mechanism** is supplied by the Bridge; the Registry declares that the seam exists and its contract. |
| **`validators`** | Pre-generation validation rules specific to this Capability. |
| **`constraints`** | Structural constraints (e.g., "a form requires at least one field"). |
| **`templates`** | References to the dumb Templates used for generation. |
| **`guardrails`** | Capability-specific Guardrail rules (pre and post). |
| **`metadata`** | Human-readable description, tags, and documentation links. |

### 8.2. Registry Versioning

The Registry is versioned independently. A Registry version pins:

- the set of available Capabilities;
- each Capability's input/output schema;
- the validators and constraints.

### 8.3. Registration Without Runtime Modification

New Capabilities are registered by adding them to a Bridge's Registry — **the Runtime is never modified**. The process:

1. Define the Capability schema (inputs, outputs, validators, constraints).
2. Implement a Provider in the Bridge.
3. Create the dumb Templates.
4. Add Guardrail rules (pre + post).
5. Register in the Bridge's Registry manifest.
6. The Runtime discovers the new Capability via `resolve()`.

### 8.4. Self-Verification

Each Bridge can implement contract tests that verify its Registry against the installed framework version. A contract test fails the build in case of drift between the Registry and the actual framework API.

---

## 9. Provider Architecture

Bridges are internally composed of **Providers** — modular units that implement one or more Capabilities.

### 9.1. Structure

```
Bridge
  ├── Registry           → typed catalog of Capabilities
  ├── Provider: Component → implements the "component" Capability
  ├── Provider: Form      → implements the "form" Capability
  ├── Provider: Table     → implements the "table" Capability
  ├── Provider: Dialog    → implements the "dialog" Capability
  ├── Provider: HTTP      → implements the "http" Capability
  ├── Templates/          → dumb interpolation files
  ├── Guardrails/         → pre + post rules
  └── Bridge Skill        → agent knowledge fragments
```

### 9.2. Provider Contract

Each Provider:

- declares which Capabilities it implements;
- accepts resolved inputs from the Execution Graph;
- selects and populates the appropriate Templates;
- produces raw Assets;
- for **logic-bearing** capabilities (**D2a/D2d**), produces the disposable scaffold **and** declares the durable `src/` seam (path, typed contract, binding mechanism) for the two-mode `emit()`;
- never calls the Runtime or other Providers directly.

### 9.3. Extensibility

Third parties extend a Bridge by adding new Providers without modifying existing ones. The Registry discovers Providers at `resolve()` time.

---

## 10. Guardrails (The Product)

The differentiator is not generating code — it is **preventing the agent from straying from the standard**. Enforcement in a **double barrier**:

- **Pre-generation (prevention):** the agent can only **express what the Registry allows**. Components outside the design system, non-existent props, or disabled Capabilities are simply not representable in the Specification. Restriction at the source.
- **Post-generation (proof):** the emitted Assets undergo **AST/lint** verification (engine: **Biome**, the same pinned Rust tool that backs the formatter — §11/§19.3) against the Bridge's rules. Any violation **fails the gate (422)** and blocks emission.

Guardrails are **defined by the Bridge** (each framework/design system has its own) and **parameterized** in `boyscout.config.yaml`. This is what makes the product valuable for enterprises: standardization, architecture, and compliance guaranteed by design, regardless of the AI model.

> **Governance boundary (D2d).** The double barrier fully governs **generated scaffolds** (declarative capabilities in full; the structure/wiring of logic-bearing ones). For the **durable human logic bodies** of logic-bearing capabilities, the post-barrier enforces the **typed contract** (compiler) and **lint-level** rules (naming, forbidden imports) — but cannot AST-prove arbitrary business logic is to-standard. Compliance claims are scoped accordingly (§16).

---

## 11. Determinism Guarantees

BoyScout guarantees **byte-for-byte reproducibility** of generated Assets. Determinism is an **engineered, enforced, and tested subsystem — not a property that is merely asserted** (**D3a**). This section is structured as: the **boundary** (what is covered), the **primitives** (how it is guaranteed), the **proof** (how it is tested), and **what is not deterministic**.

### 11.1. Deterministic Inputs

The complete set of inputs that determine output:

| Input | Versioned? | Description |
|---|---|---|
| **Specification version** | ✓ | The `boyscout-spec.json` **canonical** content hash (see §11.3) |
| **Runtime version** | ✓ | The `@boyscout/runtime` package version |
| **Bridge version** | ✓ | The Bridge package version (e.g., `@boyscout/bridge-material@1.2.0`) |
| **Registry version** | ✓ | The Capability catalog version (pinned by Bridge version) |
| **Template version** | ✓ | Template content hashes (pinned by Bridge version) |
| **Formatter version + config** | ✓ | The **Biome** version **and** its resolved config hash, run hermetically (§11.3) |
| **Guardrail version** | ✓ | Guardrail rule versions (pinned by Bridge version) |
| **Resolved dependency closure** | ✓ | `boyscout.lock` pins the **full transitive closure** of anything that touches output (a formatter plugin's transitive dep can shift bytes), not just direct versions |

### 11.2. The Determinism Boundary

- **Covered:** the `.running/` generated Assets, the Execution Graph, and the spec checksum. **Same inputs (§11.1) ⇒ same bytes.**
- **Not covered:** the durable, human-owned `src/` logic layer of logic-bearing capabilities (**D2b**). The generated base references the human artifact by a **stable, spec-derived path**, so the *reference* is deterministic even though the referent's *content* is not.

### 11.3. Determinism Primitives (the real guarantees)

"No OS randomness" is a footnote, not the threat. The actual byte-drift sources — and the single sanctioned mechanism that neutralizes each — are:

- **Canonical serialization.** `JSON.stringify` is order-sensitive and sorts numeric-string keys; the spec checksum is unstable without it. A **canonical-JSON** primitive (sorted keys, fixed number formatting, defined null/undefined policy) is the *only* serializer used for hashing/emit.
- **Ordering discipline.** Every `Map`/`Set`/`Object.keys` collection that feeds output is **sorted before iteration** via a **byte/codepoint collator** — never ambient `localeCompare` (locale-dependent). The Planner's topological sort uses the same byte-collation tie-break.
- **Deterministic reassembly.** Parallel node execution is allowed for speed, but results are **reassembled into graph order before emit**.
- **Hermetic formatter (Biome).** The formatter is **Biome** (pinned Rust binary), invoked with explicit config **and ambient config-file discovery disabled** — it never picks up a stray `biome.json` from a parent directory. Biome is chosen for cross-OS byte-stability (the D3b long-pole) and doubles as the post-barrier lint engine (§10), so format + lint are one pinned tool.
- **Byte-writer.** All output is written **LF-only, UTF-8 no BOM**, fixed final-newline. **No timestamps, no absolute paths / usernames / `homedir()`, no env-dependent content** in generated files.
- **Normalized generation environment.** `TZ=UTC`, fixed locale; generation branches never read ambient env.
- **Stable hashing.** Pinned algorithm (SHA-256) computed over **canonical** bytes; the spec checksum (and any future content-addressing, D4) depends entirely on canonical serialization.

These primitives live in a **core module that is the only sanctioned path** for serialize/sort/format/write, so drift cannot be introduced by accident.

### 11.4. Reproducibility Proof (cross-OS)

- **Scope:** byte-for-byte identity across **Linux, macOS, and Windows**, given spec + `boyscout.lock` (**D3b**).
- **Proof, not assumption:** golden-file snapshots run on **all three OSes in CI**. The formatter is the long-pole risk and is the primary target of the multi-OS suite.
- **Deterministic IDs:** all identifiers are stable/derived — never OS randomness.

### 11.5. What Is Not Deterministic

- The AI agent's planning (Intent → Specification) is stochastic by nature. This is by design: AI decides *what* to build.
- The browser preview rendering (client-side React). This is cosmetic and does not affect generation.
- **The durable `src/` human logic bodies** of logic-bearing capabilities (**D2a/D2b**). They are hand-written, outside the determinism boundary by construction, and are not golden-file tested (their seam is contract-tested instead — §20).

---

## 12. Versioning Strategy

### 12.1. Version Matrix

| Artifact | Versioning Scheme | Compatibility |
|---|---|---|
| **Runtime** | SemVer | Runtime protocol changes follow SemVer major bumps. |
| **Bridge** | SemVer | Bridge versions pin Registry, Template, and Guardrail versions. |
| **Registry** | Pinned by Bridge | Breaking changes require a new Bridge major version. |
| **Capability** | Pinned by Registry | Input/output schema changes are breaking. |
| **Template** | Content-hashed | Templates are identified by content hash within a Bridge version. |
| **Specification** | Schema-versioned | Specification schema changes follow SemVer. Migration tools provided. |
| **Formatter** | Pinned version | Exact formatter version is locked in `boyscout.config.yaml`. |

### 12.2. Reproducibility Contract

A `boyscout.lock` manifest captures the exact version of every artifact used in a generation run — including the **full transitive dependency closure of anything that touches output** (formatter and its plugins, parser, template engine), not just direct versions (**D3b**). Replaying with the same lock file guarantees identical output.

---

## 13. Capabilities → Bridges → Assets Model

Instead of coupling to the concept of "framework" (Angular Generator, React Generator…), BoyScout is organized by **Capabilities**:

```
Runtime     → agnostic orchestrator
Capability  → generation unit (component, form, route, http, store, service)
Bridge      → binding (design system + conventions + Registry + Providers + Templates + Guardrails) of a Platform
Platform    → framework runtime (Angular, React, …)
Asset       → emitted file (.ts, .html, …)
```

Changing the Platform only changes the **Bridge** — the Runtime remains the same.

### 13.1. `boyscout.config.yaml` — Composition, Never Logic

Project-level artifact that **assembles the pipeline** declaratively. Describes composition; **never** implements behavior.

```yaml
platform: angular            # or: react
bridge: material             # or: astryx-react

capabilities:                # what this project can generate
  - component
  - form
  - route
  - http

bridges:
  material:
    package: "@boyscout/bridge-material"
    version: "1.0.0"

guardrails:                  # activated/parameterized here; rules come from the Bridge
  naming: kebab-case
  standalone: true
  signals: true
  typedForms: true
  designSystem: enforce

templates:                   # optional overrides; defaults come from the Bridge
  component: bridge://material/component
  service: bridge://material/service
```

> **Two artifacts, distinct roles:** `boyscout.config.yaml` (pipeline composition, per project) × `boyscout-spec.json` (the validated design of screens/features, per feature). The first assembles the Runtime; the second is the approved software contract.

### 13.2. Reference Bridges (v1)

Two first-class Bridges (build order and roles per **D1**):

- **`@boyscout/bridge-astryx-react`** — React + Astryx. The **first-built platform** and the **core high-fidelity path** (preview ≈ output). Provides the `<Renderer/>` that is **core authoring-stage infrastructure** for all previews (§1.3). Self-verifiable Registry from Astryx's typed catalog. Capabilities: component, route, query, store. Because it is entangled with the authoring core, it proves little about agnosticism — it is home turf.
- **`@boyscout/bridge-material`** — Angular + Material Design. The **proof-of-agnosticism bridge**, built second: a clean, independent Bridge that passes the same Runtime contract suite (§20) to prove the core knows no framework. Self-verifiable Registry from the framework's typed catalog. Capabilities: component, form, route, http. Its previews are honest structural wireframes (§1.3). **It is the go-to-market marquee** (**D7** — governed enterprise Angular is the headline sell) even though it is built second.

> **Agnosticism is proven by Material alone.** One clean cross-framework Bridge passing the Runtime contract suite *is* the proof; the "two bridges prove it" framing overclaims, because Astryx shares the authoring core.

Each Bridge packages: **Registry** + **Providers** + **Capability definitions** + **Templates** + **Guardrails** (pre + post) + **Bridge Skill** (agent knowledge: conventions, imports, tokens, architecture, naming).

---

## 14. Architectural Invariants

**Laws (immutable):**

1. **The *generation Runtime* never contains framework knowledge.** Framework knowledge exists exclusively inside Bridges. *(Scope note per D1: this governs the agnostic generation backend — `@boyscout/runtime`, which never imports React nor the `<Renderer/>`. The React/Astryx `<Renderer/>` is core **authoring-stage** infrastructure, a distinct product layer; it renders the *generic* AST and never learns a target framework, so no target-framework knowledge leaks into authoring either.)*
2. **Templates never contain business logic.** Templates are dumb interpolation. All decisions live in the Planner, Registry, and Guardrails.
3. **Bridges own conventions.** Naming, imports, architecture patterns, design-system usage, **and the scaffold↔logic seam mechanism (D2d)** are Bridge responsibilities.
4. **Guardrails own enforcement.** Both pre-generation restriction and post-generation verification are Guardrail responsibilities. Governance is **provable for generated scaffolds, lint-level for durable human logic bodies (D2d).**
5. **The Specification is the source of truth *for what is generated*.** All generated Assets derive from the Specification. *(Per D2a/D2b: for logic-bearing capabilities there is also a durable human-owned `src/` logic layer the spec does not own; the spec owns its shape/contract, humans own its behavior.)*
6. **Generated scaffolds (`.running/`) are disposable** and regenerate identically from the Specification. *(Per D2b: the durable `src/` human logic layer is **not** disposable and is never regenerated.)*
7. **Determinism is mandatory.** Same inputs (§11.1) + same Specification = same bytes, cross-OS, for `.running/`. Enforced by the primitives subsystem (D3a), proven by multi-OS golden CI (D3b).
8. **AI decides what; the Runtime decides the how-of-construction; the human owns the how-of-behavior (D2a).** The LLM participates only in planning (Intent → Specification). Scaffold generation is deterministic. Business logic is human-owned.
9. **No logic in templates; no framework knowledge in the generation Runtime.** These are invariants, not future goals.

**Scoping choices (defensible v1 stances, not eternal laws — may be revisited):**

- **No vector search / RAG.** Template and Capability discovery is deterministic, not probabilistic. *(A v1 stance; a future release could add fuzzy component discovery without violating any law above.)*

---

## 15. Runtime Extensibility

Third parties can extend BoyScout without modifying the Runtime by creating:

| Extension Point | What It Does | How to Create |
|---|---|---|
| **Bridge** | Adds support for a new Platform + design system | Implement the Bridge contract: Registry, Providers, Templates, Guardrails, Bridge Skill |
| **Provider** | Adds new Capability implementations to an existing Bridge | Implement the Provider contract and register in the Bridge's Registry |
| **Capability** | Defines a new generation unit | Define the schema (inputs, outputs, validators, constraints) and implement a Provider |
| **Guardrail** | Adds new enforcement rules | Implement pre or post Guardrail rules and register in the Bridge |
| **Template** | Adds or overrides generation templates | Create dumb Eta templates and reference in the Registry or `boyscout.config.yaml` |

The Runtime discovers all extensions at `resolve()` time. No Runtime code changes are required.

---

## 16. Enterprise Value Proposition

The go-to-market marquee is the **Material/Angular bridge** (**D7**): governed enterprise Angular is the headline sell, even though React/Astryx is built first as the technical foundation (**D1**). BoyScout addresses enterprise software engineering challenges that AI code generators cannot:

| Concern | How BoyScout Addresses It |
|---|---|
| **Governance** | Engineering standards are encoded in Bridges and Guardrails, enforced at generation time. No developer can bypass the *construction* standards (structure, wiring, conventions). |
| **Compliance** | The double-barrier Guardrail system provides **provable** compliance for generated scaffolds (structure/wiring/conventions), and **lint-level** enforcement on durable human logic bodies (**D2d** — no tool can AST-prove arbitrary business logic is to-standard). Claims are scoped accordingly. |
| **Standardization** | Every generated Asset conforms to the same conventions, architecture, and design system — regardless of which developer or AI model initiated the generation. |
| **Auditability** | The Specification, Execution Graph, and version manifest provide a complete audit trail from intent to output. |
| **Reproducibility** | Byte-for-byte determinism means any generation can be reproduced exactly from its inputs. |
| **Vendor Independence** | The Runtime is model-agnostic. Generation logic, standards, and determinism are unaffected by which AI provider is used — the model participates only in planning. |
| **Model Independence** *(precise, D6)* | The guarantee is **reproducibility given a Specification** and **governance that holds regardless of model** — *not* identical output across different models. A different model yields a different *valid* spec → different *valid* output; replaying the *same* spec always yields the same bytes. |
| **Long-term Maintainability** | The Specification is the durable artifact. Generated code is disposable and re-generable as standards evolve. |

---

## 17. Authoring DSL and Preview

### 17.1. DSL (OpenUI-lang) — Visual Capability Authoring

- **Syntax:** `id = Component(arg1, arg2)`, **positional arguments** (never alphabetical order/arbitrary keys).
- **One AST, two consumers:** the `@openuidev/lang-core` parser (line-oriented, streaming-first) produces the typed AST, which feeds (a) the React `<Renderer/>` → Astryx for the **preview** and (b) the target Bridge's **generation**. The `<Renderer/>` is React and serves **only the preview**; production output follows the Bridge's generation path.
- **Persisted, first-class artifact (D10):** `.openui` DSL files are persisted, versioned, and human-editable — a byte-stable **editable projection** of the AST. The **AST is canonical**; `boyscout-spec.json` is its authoritative persisted form (the generation source of truth); `.openui` stays in lockstep via the round-trip guarantee.
- **Validation and Round-Trip:** Zod 4 validates nodes/trees; `parse → bind → validate → serialize` is byte-stable **in both directions** and determinism-covered (**D3a/D10**), carried by property tests in v1. (Fuzzing is later hardening — **D5**.)

### 17.2. Dumb Templates

Templates contain **zero business logic** — only interpolation and partials (`component.ts.eta`, `service.ts.eta`, …). All decisions live in the Planner/Registry/Guardrails, not in the Template. We use **Eta** (deterministic) with `autoEscape:false`; the "dumb Template" rule is the guarantee, not the engine.

---

## 18. Workflow

There is no direct user interaction with the CLI; the agent operates the CLI via direct **CLI invocation** + thin context Skill.

1. **Intent Discovery (Terminal):** user describes the screen/feature in natural language.
2. **Composition (Agent):** the agent resolves `boyscout.config.yaml` (Platform/Bridge/Capabilities) and deterministically selects a base Template.
3. **Closed Questionnaire (Browser):** deterministic form (composed with Astryx), closed alternatives, no free inference.
4. **Live Workspace (Browser):** features flow via SSE to the preview (React `<Renderer/>` + Astryx — fidelity as per §1.3); per-node annotations (`{nodeId: text}`) enrich the context.
5. **Validation Gate:** no Assets are emitted until **all features are approved** and the Specification passes the gate (422 — `validateSpec`), including post-Guardrails.
6. **Generation (CLI):** `boyscout generate` runs the Runtime Protocol (§7) and emits scaffolds to `.running/` — no path traversal, byte-stable, idempotent. Non-visual Capabilities are generated headless. Logic-bearing capabilities also durable-emit a human logic stub to `src/` **only if absent** (**D2b**), never overwriting existing human code.

---

## 19. Implementation Reference

### 19.1. Bridge Implementation Examples

The following examples illustrate how Bridges implement platform-specific standards. These are implementation details, not architectural concepts.

**Material Design Bridge (Angular):** emits state-of-the-art Angular using standalone components, zoneless detection with `ChangeDetectionStrategy.OnPush`, signals (`input()`/`output()`/`model()`), native control flow (`@if`/`@for`/`@switch`/`@let`/`@defer`), `inject()`, `takeUntilDestroyed`, functional guards/interceptors, `provideHttpClient`, and typed reactive forms. All of these are enforced by the Bridge's Guardrails.

**Astryx/React Bridge:** emits React components using Astryx design system components, hooks-based state management, and TypeScript strict mode. Provides the shared `<Renderer/>` for preview.

### 19.2. Monorepo Structure

pnpm Workspaces. **Agnostic core** × **Bridges per stack**.

- **`apps/cli`** — bundled entry; Hono (HTTP), live SSE, and Runtime host (operated directly via CLI).
- **`apps/boyscout-ui`** — React SPA for preview/approval (Design Space); uses `<Renderer/>` + Astryx.
- **Core (`packages/`, agnostic):**
  - `@boyscout/schemas` — Zod 4 contracts (Specification, config, Capabilities, events, patches, Guardrail results).
  - `@boyscout/determinism` — the enforced primitives subsystem (**D3a**): canonical-JSON, byte-collation sort, hermetic-formatter wrapper, byte-writer (LF/UTF-8/no-BOM/no-timestamp). The **only** sanctioned path for serialize/sort/format/write across the whole Runtime.
  - `@boyscout/dialect` — OpenUI-lang parser/AST + validation (authoring).
  - `@boyscout/runtime` — agnostic orchestrator (Runtime Protocol: load → resolve → plan → validate → generate → format → verify → emit). **Does not know the framework.**
  - `@boyscout/planner` — Specification + config → deterministic Execution Graph.
  - `@boyscout/codegen` — generic Template execution engine (Eta); framework-agnostic.
  - `@boyscout/guardrails` — double barrier engine (pre: expressible restriction; post: AST/lint); rules injected by Bridges.
  - `@boyscout/spec` — multi-layer validator / 422 gate.
  - `@boyscout/questionnaire` — deterministic YAML questionnaire (`enabledWhen`).
  - `@boyscout/cli-tools` — CLI entrypoints per pipeline stage.
  - `@boyscout/skill-template` — thin Skill (agentskills.io standard) that composes Bridge Skill fragments.
- **Bridges (`packages/bridges/`, per stack):**
  - `@boyscout/bridge-material` — Angular + Material Design (typed Registry, Providers, Capabilities, Templates, Guardrails, Bridge Skill).
  - `@boyscout/bridge-astryx-react` — React + Astryx (Astryx Registry, Providers, Capabilities, Templates, Guardrails, Bridge Skill, preview `<Renderer/>`).

### 19.3. Technology Stack

- **Core:** Node.js v20+; pnpm; global *strict* TypeScript; Zod 4; **Biome** (pinned) as the single format + lint tool.
- **Backend (Daemon):** Hono — statics, transactional REST, SSE, and direct CLI integration.
- **Frontend App:** React v19 + Tailwind v4; preview via Astryx + `<Renderer/>`.
- **Templates & Parsing:** typed catalog (Bridge Registry); Eta (`autoEscape:false`) for dumb Templates.
- **QA:** Playwright (E2E agent→CLI→browser→generate) and Vitest (unit). See §20.

---

## 20. Testing Strategy

- **Parser/DSL:** byte-stable **both-directions** round-trip property tests (**D10**), since `.openui` is a persisted first-class artifact. *(Fuzzing deferred as later hardening, **D5**.)*
- **Determinism (the thesis):** byte-by-byte golden-file snapshots of `.running/`, run on **Linux + macOS + Windows** in CI (**D3b**) — the formatter is the long-pole target. Covers `.running/` only; durable `src/` is excluded (**D2b**).
- **Determinism primitives (D3a):** unit tests for canonical-JSON, byte-collation ordering, hermetic-formatter (ignores ambient config), and byte-writer (LF/UTF-8/no-BOM/no-timestamp).
- **Seam (D2d):** contract tests per logic-bearing capability — **regen preserves the human `src/` file**, a **signature change yields a compile error**, and post-guardrails verify contract + lint.
- **Registry:** contract test per Bridge against the installed framework version.
- **Guardrails:** positive/negative cases proving blocking (422) on pre and post violations.
- **Agnosticism:** the **Material bridge** running the same Runtime contract suite as Astryx is the proof the core knows no framework (**D1** — Astryx is home turf and proves little; agnosticism rests on Material).
- **Execution Graph:** serialization round-trip tests; deterministic ordering verification (byte-collation tie-break).
- **E2E:** *(in v1, **D5/D9**)* Playwright of the full flow agent → CLI → browser → approval → generate — the full authoring surface (questionnaire + SSE + preview, **D9**) exists in v1, so it is covered end-to-end.

---

## 21. Security and Integrity

- Endpoints with *Bearer* session token (**CSPRNG**) + *Origin Enforcement*; paths shielded against `..`; default bind to loopback (`127.0.0.1`) (`0.0.0.0` only under explicit config).
- The "no OS randomness" rule applies **exclusively to generation and ID derivation** (stable/derived) — **never** to the session token, which requires cryptographic randomness.

---

## 22. Scope and Non-Goals

**In scope (v1):** agnostic generation Runtime + React/Astryx authoring core (incl. the `<Renderer/>`) + **two Bridges** (Astryx/React first-built + core high-fidelity path; Material Design/Angular as the proof-of-agnosticism bridge, built second — **D1**); visual design-gate; double barrier Guardrails; **both capability tiers** — declarative and logic-bearing, the latter with the durable-seam `src/` layer (**D2a–D2d**); Runtime Protocol (incl. the two-mode `emit()` — **D2b**); Execution Graph **with parallel execution + deterministic reassembly** (**D8**); Provider architecture; the determinism-primitives subsystem (**D3a**); the **full authoring surface** — closed questionnaire engine + SSE live workspace + Renderer preview + approval gate (**D9**), covered by full E2E; **persisted `.openui` DSL** with byte-stable both-directions round-trip (**D10**).

**Out of scope (Non-Goals):**

- **No multi-user / team server:** local execution, single-user; the versioned Specification in git is the sharing mechanism.
- **No manual editing of `.running/`:** generated scaffolds are disposable. For **declarative** capabilities the Specification is the only editable artifact. For **logic-bearing** capabilities there is *also* a durable, human-owned logic layer in `src/` (**D2a/D2b**) — hand-written, never regenerated, wired to the scaffold by a compiler-enforced contract. So "the Specification is the only editable artifact" holds for the declarative tier only.
- **No merge / protected-region codegen (D2c):** the scaffold↔logic seam is always two files with a typed contract, never one file with preserved regions — the latter makes output depend on prior file contents and breaks determinism.
- **No pixel-by-pixel visual fidelity guarantee** in the preview of Bridges whose design system differs from Astryx (§1.3) — this now lands on the Material bridge, whose preview job is *structural approval*, not appearance.
- **No layout drag-and-drop.**
- **No vector search / RAG** — Template/Capability discovery is deterministic. *(A v1 scoping choice, not an eternal law — see §14.)*
- **No autonomous writing of application *business logic*** by the agent or Runtime. The Runtime deterministically scaffolds structure/wiring to standard; business-logic bodies are durable human-owned artifacts (**D2a**). The agent never writes application code outside the validated gate.
- **No logic in Templates** and **no framework knowledge in the Runtime** — architectural invariants, not future goals.

---

## 23. Dependencies

- Build via `pnpm` (`build`, `typecheck`, …); host operation requires modern `node`/`npx`.
- Each Bridge manages its own framework dependencies (e.g., Material Design Bridge syncs with its target framework version via self-verifiable Registry).
- Loopback service by default.

---

## 24. Vision

BoyScout represents a new paradigm in software engineering:

> **AI should decide *what software should exist*. Deterministic platforms should decide *how software is built*.**

The industry's current approach — prompting an LLM and hoping for correct, consistent, standards-compliant output — is fundamentally incompatible with enterprise requirements for governance, reproducibility, and compliance.

BoyScout transforms software generation from a **prompt-driven activity** into a **governed, deterministic, reproducible engineering process**:

- The **Specification** replaces the prompt as the source of truth.
- The **Governed Runtime** replaces the LLM as the generation engine.
- **Bridges** replace framework-specific generators with extensible, versioned, standards-encoded modules.
- **Guardrails** replace code review with automated, provable compliance.
- **Determinism** replaces hope with guarantees.

The result is a platform where organizations own their software generation standards — independent of AI vendor, independent of model version, independent of individual developer skill. The AI contributes creativity and intent. The Runtime contributes governance, determinism, and reproducibility.

**BoyScout is not a better code generator. It is the governed runtime that makes code generators trustworthy.**
