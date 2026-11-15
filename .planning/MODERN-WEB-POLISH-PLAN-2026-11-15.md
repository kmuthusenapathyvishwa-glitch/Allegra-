# Allegra web polish plan

Status: 1.69.0 merged in PR #141. The bounded follow-up fixes playlist-sheet focus restoration and narrow-screen mini-player/album layout; the remaining broader polish steps are still planned. See WORKTREE-RECONCILIATION-2026-11-15.md for evidence.

## Guidance and constraints

Installed with `npx modern-web-guidance@latest install`. Read the installed skill and retrieved `dialog`, `responsive-design`, `performance`, and `efficient-background-processing` guides. Preserve DESIGN.md's artwork, glass, color and motion tokens. Preserve the layout-owned audio element, playback intent funnel, native Android audio authority, Connect and Range/206 handling.

## Source findings

- `apps/web/src/components/PlaylistMenu.tsx` focuses Close in an effect before `useFocusTrap` captures `document.activeElement`. The hook can therefore remember Close rather than the invoking song action. The sheet uses a custom portal and modal semantics. This is the first bounded fix to verify in a browser.
- `apps/web/src/styles/app.css` already uses dynamic viewport units across the shell and sheets. Check remaining collisions and sizing in rendered views instead of replacing working viewport rules.
- `apps/web/src/components/shader/MusicFlowShader.tsx` already handles IntersectionObserver and document visibility. Preserve and measure those controls before adding rendering optimizations.
- The skill's deterministic scan reported one candidate: the admin passcode in `LyricsSyncDialog.tsx` disables autocomplete. Determine its credential semantics before choosing a password-manager token; it is not the listener's normal sign-in password. The scan covers only about 20% of the guidance catalog and is not a complete audit.

## Implementation order

1. **Baseline the real flows.** Capture Home, Search, Library, Now Playing and lyrics, playlist actions, Settings/sign-in, and Connect. Check desktop, tablet, narrow phone widths, browser zoom at 200%, keyboard-only operation and reduced motion. Record actual collisions and missing focus states.
2. **Finish one overlay slice.** Fix PlaylistMenu focus capture/return; use native modal dialog behavior where compatible with exit animations and nested overlays. Preserve its glass appearance, queue routing and playlist creation. Verify Escape, outside press/release, Tab/Shift+Tab, background interaction, scroll containment and return to the original song button. Expand to other sheets only after this passes.
3. **Polish layout and control consistency.** Audit shell/sidebar/player spacing, long titles, search filters, artwork geometry, safe-area clearance, empty/loading/error states, and focus indicators. Use existing tokens. Add container queries only for components that actually resize independently of the viewport. Verify no horizontal overflow at narrow widths or large text.
4. **Measure and improve loading/interaction.** Identify the actual LCP image; reserve artwork space; prioritize only critical visible imagery and lazy-load offscreen imagery. Profile long result lists and lyrics interactions. Defer optional heavy code only where measurements justify it. Add content visibility with intrinsic sizing only to suitable offscreen sections; keep player state and audio mounted. Verify hidden shader loops stop and resume correctly.
5. **Apply relevant principles to Android.** Check text scaling, accessible labels/states, touch targets, TalkBack traversal, sheet dismissal and focus, loading/error copy, image sizing and hidden visual effects. Use React Native APIs, AppState/navigation focus and Reanimated; DOM dialog, popover and CSS APIs do not apply to the native app. Retain the requested header layout and verify both local and Connect player gestures.
6. **Validate and release.** Run root checks, production web build and applicable Playwright tests, with rendered browser verification for each changed slice. Run mobile and Kotlin gates for native changes. Keep web polish in a separate follow-up commit/PR from the consolidated mobile release so an unverified redesign does not delay 1.69.0. Merge each only after its required checks pass. Verify main APK publication, version/commit metadata and rollback assets separately from phone behavior.

## Acceptance

- A closed sheet returns focus to its invoker; only the intended overlay dismisses.
- No clipped controls, overlapping player content or horizontal page overflow across the checked sizes and at 200% text/zoom.
- Loading and failed requests have useful states and working recovery actions.
- Audio continues through navigation and overlay changes; seek, pause and remote-device routing retain their behavior.
- Performance improvements are supported by before/after measurements; no claim of field Core Web Vitals without field data.
- Phone-only gesture/performance checks remain explicitly pending until exercised on a device.

## Integration checkpoint

Root typecheck/lint/tests passed, including 27 infra tests and 108 Convex tests. Mobile secret scan/lint/typecheck/tests passed: 225 suites, 1,792 tests; lint has 162 warnings and no errors. Kotlin unit tests passed: 216 tests, no failures, errors or skips. Consolidated PR: https://github.com/peterish8/allegra/pull/141 at 85b0a5bb. CI and branch smoke are pending; no merge yet.


