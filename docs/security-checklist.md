# §21 Security & Integrity — Checklist Gate

Each FIRST-SPEC §21 control maps to the test that proves it. All must pass before ship.

| Control (§21) | Implementation | Proving test |
|---|---|---|
| CSPRNG session token (24-byte draw; never the generation no-OS-randomness path) | `apps/cli/src/author/command.ts` `defaultAuthToken()` | `apps/cli/test/security-token.test.ts` — "default token is 48 lowercase-hex chars (randomBytes(24))" |
| Bearer session token required | `apps/cli/src/author/app.ts` (`Authorization: Bearer`) | `author-app.test.ts` — "rejects /api without a token (401)", "rejects a wrong token (401)" |
| Origin enforcement | `apps/cli/src/author/app.ts` | `author-app.test.ts` — "rejects a foreign Origin (403)", "allows a valid token with matching Origin" |
| Path shielding against `..` | `apps/cli/src/author/commit.ts` `shieldWrite()` | `author-commit.test.ts` — "§21 refuses to write outside the project root (path traversal)" |
| Loopback-default bind (`127.0.0.1`; other hosts only under explicit `--host`) | `apps/cli/src/author/command.ts` `resolveHost()` | `apps/cli/test/security-token.test.ts` — "defaults to 127.0.0.1 with no --host flag", "honors an explicit --host override (e.g. 0.0.0.0)" |

Run the gate: `pnpm exec vitest run apps/cli`.
