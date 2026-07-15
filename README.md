<p align="center">
  <img src="https://raw.githubusercontent.com/vivaldomp/boyscout/master/docs/logo.png" alt="BoyScout" width="160">
</p>

<h1 align="center">BoyScout</h1>

<p align="center">
  <strong>Governed deterministic runtime for software generation.</strong><br>
  AI decides <em>what</em> to build. The Runtime decides <em>how</em>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9">
  <img src="https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white" alt="Node >=20">
  <img src="https://img.shields.io/badge/pnpm-10.32-F69220?logo=pnpm&logoColor=white" alt="pnpm 10.32">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: alpha">
  <img src="https://github.com/vivaldomp/boyscout/actions/workflows/ci.yml/badge.svg" alt="CI">
</p>

> **Alpha.** The API can break between alpha releases. Every install line below pins `@alpha` on purpose — the `latest` tag is deliberately unclaimed.

---

## Why BoyScout?

Ask an AI agent to build a login form and you get *a* login form — plausible, idiomatic to nobody, subtly different from the last one it wrote. Ask ten times, get ten answers. The generated code is a suggestion, and every suggestion costs a review.

BoyScout splits the problem in two. **AI decides what to build; the Runtime decides how.** Your engineering standards stop being a style guide nobody reads and become executable artifacts — **Bridges, Providers, Templates, and Guardrails** — that the Runtime executes:

- **Deterministic.** The same spec and the same `boyscout.lock` produce **byte-for-byte identical output** on Linux, macOS, and Windows. Not "equivalent". Identical. It is proven by golden-file CI on all three.
- **Governed.** A guardrail violation **fails the gate** and emits nothing. Non-conforming code does not reach your repository to be argued about in review.
- **Framework-agnostic.** The Runtime knows nothing about React. Bridges teach it. Astryx/React and Material/Angular both pass the identical Runtime contract suite.
- **It leaves your code better than it found it.** Regeneration preserves human-authored logic; drift between generated scaffolding and your code surfaces as a compile error, not a silent overwrite.

## Quick start

### Install

BoyScout is built to be driven by a coding agent. `init` writes a `SKILL.md` that teaches **Claude Code** your bridge's conventions, so the agent proposes specs that fit your standards:

```bash
npx @boyscout/cli@alpha init
```

```
created boyscout.config.yaml
created boyscout-spec.json
created .claude/skills/boyscout/SKILL.md
```

<details>
<summary><strong>Other install methods</strong></summary>

```bash
# npm
npm install -g @boyscout/cli@alpha

# pnpm
pnpm add -g @boyscout/cli@alpha

# yarn
yarn global add @boyscout/cli@alpha

# bun
bun add -g @boyscout/cli@alpha
```

Then run `boyscout` instead of `npx @boyscout/cli@alpha`.

</details>

### Your first design

`init` seeds a project with a small component and a service. Generate it:

```bash
npx @boyscout/cli@alpha generate
```

```
.running/UserCard.tsx
.running/services/UserService.ts
src/services/user-service.ts
boyscout.lock
```

Three things just happened:

1. **`.running/`** files are generated, disposable, and overwritten on every run — the Runtime owns them.
2. **`src/services/user-service.ts`** is yours. It is created once and **never overwritten**. Put your logic there; regenerate as often as you like.
3. **`boyscout.lock`** pins the closure that produced those bytes. Commit it.

Now ask Claude Code for something of your own — *"add a signup form with email and password"* — and run `generate` again. The agent writes the spec; the Runtime decides how it is built.

Verify the guarantee — regenerate and confirm nothing drifted:

```bash
npx @boyscout/cli@alpha generate --check
```

> Same spec + same lock = same bytes. On any machine, on any OS.

There is also a browser authoring loop (`boyscout author`) that previews a `.openui` design before you approve it into a spec — see [CONTRIBUTING.md](CONTRIBUTING.md) to run it from source.

## Contributing

Contributions are welcome — please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. It covers development setup, running locally, the test suite, and the pull request gates.

One requirement is unusual and worth flagging up front: this repository maintains a **spec → plan → implementation traceability chain**, and contributions are expected to be produced with an **Opus- or Sonnet-class model running the [superpowers](https://github.com/obra/superpowers) skills** so that chain stays intact. CONTRIBUTING explains what that means in practice.

## License

[MIT](LICENSE) © 2026 Vivaldo Mendonça Pinto
