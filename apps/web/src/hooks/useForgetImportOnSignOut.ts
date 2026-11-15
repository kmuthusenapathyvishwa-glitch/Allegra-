import { useEffect } from 'react';

import { clearAccountCheckpoints } from '../lib/importProgressStore';
import { onBeforeSignOut } from '../lib/signOutHooks';

/**
 * Forgets the signed-in account's saved Spotify import (kept in this browser only) when they sign out,
 * so the next person on a shared computer cannot find it and the next sign-in starts clean.
 */
export function useForgetImportOnSignOut(accountKey: string | null): void {
  useEffect(() => {
    if (!accountKey) return undefined;
    return onBeforeSignOut(() => clearAccountCheckpoints(accountKey));
  }, [accountKey]);
}
