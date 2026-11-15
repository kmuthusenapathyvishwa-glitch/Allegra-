# Worktree reconciliation, 2026-11-15

## Current integration

PR #141 merged as `1a6bb6ca9a870d9ffab38474fc337876fa306852`. Its PR checks passed. The separately dispatched branch smoke was cancelled; main smoke and APK publication must be checked independently. This record does not claim phone verification or CircleCI cloud execution.

## Preserved work

All 14 worktrees were inventoried. Dirty tracked and untracked files were copied before mutations to local `output/worktree-preservation-20261115`, with binary patches and a manifest. Three other dirty checkouts were committed in place. No worktree or dependency folder was removed. Existing ignored files were left in place.

Branches whose patches are absent by ancestry but already represented by later/squashed commits are kept as archives rather than merged over newer source. Archive heads are pinned below; the original local branch names remain intact.

| Source branch | Preserved commit | Remote archive branch |
| --- | --- | --- |
| `fix/web-auth-dialog-focus` | `0c2c7d74a8aa8253de474f5fa305bb0200439f3c` | `archive/worktrees-20261115/fix-web-auth-dialog-focus` |
| `chore/circleci-android-preview` | `58cd0ca7f03a6bdfaa8538e64f45c534da9db935` | `archive/worktrees-20261115/chore-circleci-android-preview` |
| `feat/discovery-polish` | `c7dd43011d25b9b3691dc23fcc44d5622a188df6` | `archive/worktrees-20261115/feat-discovery-polish` |
| `fix/mobile-one-devices-sheet` | `b3e01da403fe64afc3f4ae316bfa18ce6f369d25` | `archive/worktrees-20261115/fix-mobile-one-devices-sheet` |
| `t3/stream-updates-dropdown` | `26824ea3f131bcf9558a20536611d4aaccf5b4dd` | `archive/worktrees-20261115/t3-stream-updates-dropdown` |
| `fix/mini-player-close-settle` | `dee46a6125a8b402ab1719f54899941abb085527` | `archive/worktrees-20261115/fix-mini-player-close-settle` |
| `codex/stream-header-release-history` | `6129fca7d20c419cf749183b2ff3a9aac72ffb4e` | `archive/worktrees-20261115/codex-stream-header-release-history` |
| `t3/tamil2lyrics-alternatives` | `1b466898bfb4f5ed5b39d3aa7737236cf967900e` | `archive/worktrees-20261115/t3-tamil2lyrics-alternatives` |
| `t3/allegra-169-integration-mini-player-gesture` | `cfe8ed97c21c09d7a8c2108e5af98e7290c4ad81` | `archive/worktrees-20261115/t3-allegra-169-integration-mini-player-gesture` |

## Disposition

- `fix/web-auth-dialog-focus`: behavior merged in #98 (`da6ff9b7`). Newer main already contains the three previously dirty web test files. Preserve newer main tests.
- `feat/discovery-polish`: Quick Picks hooks/store, search categories and native transport are present in main; the later 1.60.0 work (`bf78a9a9`) and subsequent UI changes supersede the old patch. The old download component is byte-identical to main after newline normalization. Do not restore old player, search or header layouts.
- `fix/mobile-one-devices-sheet`: main uses one app-level sheet (`9064f947`) and additionally reports its expanded accessibility state. The old dirty trigger would remove that state, and its test expects it absent; archive this stale version.
- `t3/stream-updates-dropdown`: release history, rollback assets, update eligibility, mini-player geometry and release publication have newer implementations in main. Its 1.65.0 app version and older four-entry history must not overwrite 1.69.0.
- `fix/mini-player-close-settle`: later 1.69.0 player changes retain the full-width endpoint and add finger tracking. Preserve those changes.
- `codex/stream-header-release-history` and `t3/tamil2lyrics-alternatives`: equivalent patches are in #141, with the later monochrome logo and header placement retained.
- `chore/circleci-android-preview`: all three source commits were cherry-picked into #141. Wrong-target upstream PR #4 was closed. Production publication stays on GitHub Actions; CircleCI remains manual and its real cloud run is pending.
- `t3/allegra-169-integration-mini-player-gesture`: all eight implementation patches have equivalent patches on main (`git cherry`). Its only remaining unique patch is older 1.69.0 listener history; main has corrected cache/recovery wording and pinned 1.68.2 rollback metadata.
- `chore/mobile-polish-1.67.0`, `chore/ci-merge-policy`, `feat/mobile-listenbrainz`, and `chore/mobile-library-drop-albums`: no commits ahead of main.

## Remaining useful work

Install Modern Web Guidance without clearing existing Convex skill hashes. Preserve the polish plan and Echo feasibility specifications as plans, not completed features. Fix the active playlist sheet's opener capture before its autofocus effect; verify Close and Escape return focus using the deterministic browser fixture. Keep the existing animated portal for this bounded fix; broader native dialog migration and the rest of the polish plan remain separately tracked.

Paxsenix server-provider work requires an 8/10 HTTP-200-JSON probe from a Vercel preview before implementation. That probe is not verified. The existing mobile provider is separate. Last.fm and other Echo specifications are backlog plans, not half-written implementations to enable blindly.

## Verified follow-up

- `apk-latest` publishes 1.69.0 at merge `1a6bb6ca`, published 2026-11-15 08:14:56 UTC. Downloaded changelog.json records that exact version and commit. Downloaded history lists 1.69.0, 1.68.2, 1.68.1 and 1.68.0; all three named rollback assets are attached. APK internal version and physical installation were not inspected.
- All nine remote archive heads were read back with `git ls-remote` and match their captured local SHAs.
- Root typecheck, lint and tests pass. Web tests: 395 passed. Infra: 27 passed. Convex: 108 passed, plus five redirect tests.
- Chrome deterministic album/playlist/playback browser test passes, including focus return after Close and Escape, 320/360/768/1280/1920 widths and reduced motion. Initial setup now waits for onboarding before dismissing it. The new narrow-player check caught a broken `first-of-type` previous-button selector; the selector now matches the skip button immediately before Play.
- On narrow web screens, full-player shortcuts stay in the expanded player, keeping the mini bar to song information, Play/Pause and Next. Small-screen album artwork also scales against viewport height so toolbar controls stay above the fixed player.
- Browser screenshots at 320 and 360 widths were visually inspected. No physical phone, screen-reader or CircleCI execution claim is made.
- The separate main smoke run 43692173887 is still pending at this checkpoint.
