# Allegra cleanup audit

This is the living record of the repository cleanup sweeps. It lists what was
inspected, what was removed, and what is held for a decision. Update it in
place on each run so finding IDs stay stable. The first sweep (2026-11-15)
applied the safe removals on branch `chore/cleanup-repo` and held everything
that needs data, logs or an owner decision.

## Baseline

| Item | Value |
| --- | --- |
| Date / branch / HEAD | 2026-11-15 / `chore/cleanup-repo` / `e6b5224f` (equals `origin/main`) |
| Pre-cleanup snapshot | `e6b5224fe8db5a12d2d8ea1cbcd4871a9d5174e5`; dirty paths at start: untracked `.agents/skills/ponytail-*`, `.planning/cleanup/` (not mine, left alone) |
| Scope / mode / level | repo / apply / full |
| Graph freshness | graft and codebase-memory not used for deletions. Every removal was checked with `rg` over tracked files plus source reading. |

## Coverage ledger

| Area | Checked | Not reviewed |
| --- | --- | --- |
| apps/web | knip, `tsc --noUnused*`, export-reference script, test-runner glob | Duplicate fetches and subscriptions per screen |
| apps/api | knip, `tsc --noUnused*`, route-caller script, provider wiring, shared copies | Provider cascade behaviour |
| apps/mobile | knip (files), dependency-reference script, scripts and docs survey | Mobile exports, Kotlin, Android resources, API client wrappers |
| apps/desktop | Not reviewed | All of it |
| convex | Caller script over 134 functions, `.collect()` search, cron list | Per-handler read cost beyond pattern search |
| packages/shared, packages/connect | knip, `tsc --noUnused*`, duplicate search | `queueStager` generic redesign |
| tooling and tests | Script references, runner globs, `package.json` dependencies | CI workflow review |
| docs and `.planning` | Links into stale docs, mobile docs survey | `.planning/**` (389 files, history: ask first) |

## Summary

| Category | Removed or simplified | Held (verify or decide) | Kept |
| --- | --- | --- | --- |
| 1 Dead code | 11 exports, 7 unused locals, 2 generated copies | Convex relations, 4 routes, 4 mobile dependencies, 3 backfills, `playStats`, `clearAccountCheckpoints` | `trackVersion`, `QueueStager` generic |
| 2 Duplicate logic | `moodPrompts` (API copy replaced by a generated copy) | `leadArtist` (nine copies), API/shared `types.ts` drift | generated API copies |
| 3 Unused UI | `CustomAlert.tsx` | `AddListSheet.tsx` with `songList` | web components (no unused file) |
| 4 Complexity | None proven | None | `luvLink/legacy`, connect ports, `sha256.ts` |
| 5 Legacy | PR review tooling (3 files) | `README_DETAILED.md`, `RECONCILIATION.md`, root `HANDOFF.md`, `archive/dj`, `github-drafts` | `lyricflow` package path |
| 6 Reads and calls | None | Per-screen duplicate subscriptions | Convex source (no `.collect()`) |
| 7 Abandoned files | `scripts/check-convex-shape.mjs` | None | `tools/recommendations`, `mocks/server.mjs`, `.agents/skills` |
| 8 Tech debt | Web test glob widened (2 files, 8 tests now run) | `any`, `console.log`, test for the types seam | None |

Applied diff against the snapshot: 24 tracked files, +35 −859 lines, 8 files
deleted, 0 dependencies removed. One new generated file
(`apps/api/src/shared/moodPrompts.ts`, 97 lines) replaces the hand-kept
`apps/api/src/user/moodPrompts.ts`, so the net is about −730 lines. Possible
removals that were held are not in these totals.

## Findings

### 1.dead-exports REMOVE, confidence high, risk low

- **Where:** `apps/web/src/lib/api.ts` (`apiBaseUrl`, `setLikedSong`,
  `addSongToLibrary`, `removeSongFromLibrary`), `apps/web/src/lib/utils.ts`
  (`titleGradient`, `readableCount`), `apps/web/src/motion/index.ts`
  (`gsapTokens`, `exitDown`, `ACK_MS`), `apps/api/src/lib/cache.ts`
  (`LayeredCacheStore`).
- **Why unnecessary:** a search of every tracked source file, tests included,
  finds each name only at its definition. `LayeredCacheStore` was the
  Dynamo-era layered cache.
- **Evidence:** `npx knip --workspace apps/web` and `apps/api`; own
  export-reference script (`prod=0 tests=0`); no doc mentions.
- **Impact:** −105 lines (`measured`).
- **Risks:** none outside the checkout. These are module exports in a bundled
  app.
- **Validation:** root typecheck, lint and tests pass.
- **Disposition:** applied.

### 1.unused-locals REMOVE, confidence high, risk low

- **Where:** `packages/connect/src/connectSession.ts` (`lastPosition`,
  `handoffCommandId`, import `expectedPosition`), `convexWire.ts` (import
  `ConnectSnapshot`), `memoryTransport.ts` (parameter `deviceId` of private
  `applyPatch`), `connectSession.test.ts` (`clock`),
  `packages/shared/importRun.ts` (callback parameter `key`, renamed `_key`).
- **Why unnecessary:** `tsc --noUnusedLocals --noUnusedParameters` reports
  each, and the two variables are never read.
- **Evidence:** `npx tsc --noEmit --noUnusedLocals --noUnusedParameters -p
  packages/connect`; after the edit only the kept generic below remains.
- **Impact:** −9 lines (`measured`).
- **Risks:** `connectSession.ts` carries playback invariants. The removed
  variables were never read, and the connect tests pass.
- **Disposition:** applied.

### 1.api-shared-copies REMOVE, confidence high, risk low

- **Where:** `scripts/sync-shared.mjs` (`SHARED_COPIES`),
  `apps/api/src/shared/importZip.ts`, `apps/api/src/shared/scrobble.ts`.
- **Why unnecessary:** knip lists both as unused files in `apps/api`. The
  sources in `packages/shared` stay (web and mobile import them).
- **Evidence:** `npx knip --workspace apps/api`; `rg "importZip|scrobble"
  tests/infra apps/api/src --glob '!apps/api/src/shared/**'`; liveness row
  "Shared module".
- **Impact:** −121 generated lines, −2 files (`measured`).
- **Validation:** `npm run sync:shared`, infra parity test passes.
- **Disposition:** applied.

### 2.mood-prompts SIMPLIFY, confidence high, risk low

- **Where:** `packages/shared/moodPrompts.ts`, former
  `apps/api/src/user/moodPrompts.ts`, `apps/api/src/user/taste.ts:1`.
- **Why unnecessary:** the two files held the same algorithm. Only the input
  type differed.
- **Change:** the shared file declares its own `MoodTasteInput` (the structural
  subset that both the web and API summaries satisfy), the file joins
  `SHARED_COPIES`, and `taste.ts` imports the generated copy. Time-of-day
  semantics are unchanged: each caller still uses its own `new Date()`.
- **Impact:** about −97 hand-kept lines (`measured`).
- **Validation:** root typecheck and tests pass.
- **Disposition:** applied.

### 3.custom-alert REMOVE, confidence high, risk low

- **Where:** `apps/mobile/src/components/CustomAlert.tsx`, three keys in
  `apps/mobile/src/designGuards.baseline.json`.
- **Why unnecessary:** nothing imports it. Its last importer was removed in
  1.62.1 (`09b4d664`, Settings moved to theme tokens). No doc names it.
- **Evidence:** `npm run knip:mobile`; `rg "CustomAlert" apps/mobile` finds only
  the baseline keys; `git log -S CustomAlert`.
- **Impact:** −132 lines and −3 baseline entries (`measured`).
- **Risks:** a design-guard baseline that lists a missing file would fail the
  ratchet, so the keys went in the same change.
- **Disposition:** applied. Mobile version bumped to 1.69.2 (see Release
  bookkeeping).

### 5.pr-review-tooling REMOVE, confidence high, risk low

- **Where:** `apps/mobile/scripts/inspect-pr.js`, `fetch-pr-metadata.js`,
  `pr_review_context.json`.
- **Why unnecessary:** one-off review tooling for another repository
  (`LuvLyricsApp/LuvLyricsApp`). No script, workflow or doc calls it.
- **Security:** `pr_review_context.json` contains a 64-character value
  assigned to a Genius `ACCESS_TOKEN` inside an old diff. The repository is
  public, so the value is in public history from the 2026-09-29 import.
  Deleting the file does not revoke it. The value is not reproduced here.
- **Impact:** −350 lines, −3 files (`measured`).
- **Disposition:** applied. **Owner action:** revoke or rotate that Genius
  token.

### 7.orphan-script REMOVE, confidence high, risk low

- **Where:** `scripts/check-convex-shape.mjs`.
- **Why unnecessary:** a one-off that printed the length and prefix of
  `CONVEX_URL` values from env files. Nothing references it.
- **Impact:** −15 lines, −1 file (`measured`).
- **Disposition:** applied.

### 8.web-test-glob SIMPLIFY, confidence high, risk low

- **Where:** `apps/web/package.json` (`test` script).
- **Why costly:** the glob `src/lib/*.test.ts` skipped
  `src/lib/lyricAlign/drafts.test.ts` and `jobs.test.ts`, so eight tests never
  ran in CI.
- **Change:** `src/lib/**/*.test.ts`. Node 24 here and Node 22 in CI both
  expand `**` in the quoted pattern.
- **Validation:** web tests: 403 pass, 0 fail.
- **Disposition:** applied.

### Release bookkeeping

Changes under `packages/**` and `apps/mobile/**` rebuild the APK, so
`expo.version` moved from 1.69.1 to 1.69.2 and
`apps/mobile/update-history.json` gained a 1.69.2 entry in plain listener
language. The oldest entry (1.68.1) left the four-release window, and 1.69.1
gained the `sourceCommit` (`c2ca5e7a`, the commit apk-latest was built from) and
`rollbackAsset` that every retained older release needs. The infra test
`every retained older release names its source commit and signed rollback
APK` caught the missing fields and now passes. CI will build the 1.69.1
rollback APK when 1.69.2 releases.

## Held findings

Each needs the evidence or decision listed. Independent cleanup continued
around them.

| ID | Item | Action | Waits on |
| --- | --- | --- | --- |
| 1.convex-relations | `convex/relations.ts`, `songRelations` table, `relatedSong` | VERIFY/DECIDE | Owner says the Echo port will not use it, and the dashboard shows the table is empty |
| 1.routes | `POST /auth/guest` (alias of `/auth/anon`), `/ai/translate-lyrics`, `/lyrics/report`, `/lyrics/search` | VERIFY | `vercel logs` for these paths over the oldest supported release window |
| 1.mobile-deps | `react-native-webview`, `expo-linking`, `expo-system-ui`, `expo-dev-client` | VERIFY | One removal per commit, CI build, install and launch check (native autolinking) |
| 1.backfills | `backfillLastActive`, `backfillClosedReports`, `trimRecentlyPlayed` | VERIFY | Dashboard shows no profile lacks `lastActive`, closed reports are trimmed, recent plays are trimmed |
| 1.play-stats | `playStats` field in `convex/profiles.ts` and `schema.ts` | VERIFY | Data check, then a migration |
| 1.clear-account-checkpoints | `clearAccountCheckpoints` in `importProgressStore.ts` | DECIDE | It looks meant for sign-out (Spotify import data stays local). Decide whether to call it on sign-out or delete it |
| 3.add-list-sheet | `AddListSheet.tsx`, `services/stream/songList.ts` and test | DECIDE | The 1.60.0 commit `bf78a9a9` removed its only importer without saying so, and `apps/mobile/CLAUDE.md:273` still calls it live. Retired on purpose means delete it plus the doc line. Disconnected by accident means restore the list button in Stream search |
| 2.lead-artist | Nine `leadArtist` copies with different separators | VERIFY | Characterisation tests per copy, then matcher cache-key bumps for any copy whose output changes |
| 2.types-seam | `apps/api/src/types.ts` against `packages/shared/types.ts` | VERIFY | Owner decision; a test that fails on shape drift |
| 5.docs | `apps/mobile/README_DETAILED.md`, `RECONCILIATION.md`, root `HANDOFF.md`, `apps/mobile/docs/github-drafts/*` | VERIFY | Read for open items, move live content into `docs/`, fix the README link |
| 5.archive-dj | `apps/mobile/archive/dj/` | DECIDE | Owner archived it on 2026-11-12; keep or delete |
| 8.rules | Web `any` (2), mobile `any` (48), `console.log` in `convex/` (3) and mobile (73) | VERIFY | Whether mobile is held to hard rules 8 and 10 |

## Kept after inspection

- `packages/shared/trackVersion.ts`, its test and its API copy: no consumer
  today, but `.planning/echo-backend-port/P2-4-track-version-rules.md` plans one.
- `QueueStager<S extends QueueSong>` in `packages/connect/src/queueStager.ts`:
  `tsc` calls `S` unused in the interface, but removing it changes the public
  signature for every caller.
- `apps/mobile/src/services/luvLink/legacy/*`: the live Echo-room
  implementation.
- `@react-native/eslint-config` (extended as `@react-native` in
  `.eslintrc.js`) and `@edge-runtime/vm` (vitest environment).
- `packages/shared/{blendCopy,blendView,lyricSync,regions}.ts`: knip reports
  them inside the shared workspace only. Web, mobile and the API import them.
- `apps/api/src/shared/**` copies, `.agents/skills/**`, `tools/recommendations`,
  `mocks/server.mjs`.

## Checks and limits

- Root `npm run typecheck`: exit 0. `npm run lint`: exit 0.
- Root `npm test`: the first run had one failure (the release-notes history
  test, fixed above). The full rerun on the final state exits 0 (web 403, api
  269, infra, Convex 108 pass).
- `apps/mobile` had no `node_modules`, so `npm run mobile:check` first failed
  against the root ESLint 9, which is an environment gap and not a cleanup
  effect. After `npm ci --ignore-scripts` in `apps/mobile`, `mobile:check`
  exits 0: secret scan, lint (0 errors, 163 existing warnings), typecheck and
  1,792 tests in 225 suites.
- Missing evidence: no device, emulator or release verification. Nothing was
  pushed, merged, committed or released. `npx convex dev --once` was not run
  because no `convex/` file changed.

## Remaining steps

1. Rotate the Genius token (owner, now).
2. Decide the three DECIDE rows (`AddListSheet`, `clearAccountCheckpoints`,
   `archive/dj`). Small each.
3. Run the log and dashboard checks for the VERIFY rows, then remove the
   routes, backfills and relations in one Convex/API pass. Medium, because it
   needs production reads and a contract-doc update.
4. `leadArtist` consolidation with characterisation tests. Medium to large,
   because three matchers cache results.
5. Folder structure: `apps/web/src/lib` holds about 100 flat files and
   `.planning` has 389. Group `lib` by area (karaoke, dj, import, library) with
   one PR per area, moving files and imports together. Large, and best done
   after the removals above so there is less to move. Not applied here because
   a move across three apps cannot be proven equivalent by a local gate.
