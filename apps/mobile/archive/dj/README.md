# Your DJ (phone app), archived 2026-11-12

Paused in LuvLyrics 1.46.2. The web DJ is unaffected. Nothing under `archive/` is compiled, bundled, linted or tested.

Files: `DjScreen.tsx` (was `src/screens/`), `services/djApi.ts` and `services/localDj.ts` (were `src/services/dj/`).

## Restore

1. `git mv` the three files back to `src/screens/DjScreen.tsx` and `src/services/dj/`.
2. Re-add the entries removed in the archiving commit (or `git revert` it): the `Dj` tab screen in
   `navigation/TabNavigator.tsx`, `Dj: undefined` in `types/navigation.ts`, the `'dj'` action and row in
   `navigation/profileMenu.ts` and its branch in `components/V6TabBar.tsx`, the row in `screens/YouScreen.tsx`,
   and the More menu tile (`components/moreItems.ts`, `moreMenuPayload.ts`, the mascot in `MoreMenu.tsx`).
3. Still in place on purpose: `StreamService.startDj*` / `applyDjUpcoming`, `sync/onlinePlaylist`, and the
   Kotlin `dj-mascot` drawing in `NativeMoreItemsView.kt`.
4. Re-add `llama.rn` (it was removed in 1.70.2 and `localDj.ts` imports it): `npm install llama.rn` here, and its
   plugin entry in `app.json` (`enableEntitlements`, `forceCxx20`, `enableOpenCL: false`). It adds about 30 MB to the APK.
5. Bump `expo.version`, then `npm run mobile:check`.
