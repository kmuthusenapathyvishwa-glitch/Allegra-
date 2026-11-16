# Mobile design guard baseline report

Run from the repository root:

```sh
npm run bench:baseline
```

The script writes `.planning/v2/design-guards-<full-HEAD-SHA>.json`. It uses exclusive file creation, so rerunning on the same commit requires an explicit alternate path, for example:

```sh
node scripts/bench/allegra-baseline.mjs --output .planning/v2/recheck.json
```

The report records the full commit, branch, exact `git status --porcelain=v1 --untracked-files=all` lines, SHA-256 hashes for the benchmark script, guard source and committed design baseline, and current counts compared with the committed per-file baseline. Counts come from `apps/mobile/src/designGuards.test.ts`; the report pins that source hash because its regex and TypeScript AST heuristics define the measurement. The benchmark loads the exact TypeScript version pinned as a root development dependency (the package installed by root CI), reports its resolved path and version, and temporarily exposes the guard's private count and source-inventory helpers in memory. This does not alter or instrument the checked-in guard file, so its fingerprint is the exact measured source. The compiler version currently matches the mobile app's `~5.9.2` TypeScript constraint; update the root exact pin only with an intentional compiler change. A count above baseline is shown per file as `filesOverBaseline`; a lower count is shown as `filesBelowBaseline` so the ratchet can be deliberately updated.

## Evidence limits

This is a reproducible **static source/design-guard measurement**. Counts do not measure runtime speed, app responsiveness, visual quality, accessibility behavior, APK size, playback, or device results. Regex rules can count comments and strings, and AST rules are source heuristics. The report does not execute the application or tests and makes no timing claims. Dirty status paths are recorded, but file contents are not copied into the report; use the recorded commit and input hashes when comparing runs.

No report is checked in as a benchmark result by default. A report describes the checkout on which the command actually ran and should be reviewed before sharing.
