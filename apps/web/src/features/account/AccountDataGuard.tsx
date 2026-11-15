import { useLayoutEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/queries';
import { useFarm } from '@/contexts/FarmContext';
import { useCommunityArea } from '@/features/community/CommunityAreaContext';
import { clearRecommendStorage } from '@/recommend/form/draft';

/**
 * Keeps per-account data in this browser from leaking between accounts.
 *
 * The farm profile, Community area, community post draft and recommendation answers are stored in
 * this browser (localStorage / sessionStorage), not per account. This guard remembers WHICH account
 * that data belongs to and clears it:
 *  - when a different account logs in or signs up on this device, and
 *  - when the user logs out (farm phones are often shared).
 * Data with no owner (saved before this guard existed) is treated as belonging to someone else.
 * Device settings (language, low-bandwidth mode) are kept. Server-side saved fields are unaffected:
 * they already belong to each account and come back after logging in.
 */
export const OWNER_KEY = 'fv.dataOwner.v1';
/** Stored by pages that are loaded on demand (kept here so this guard stays light). */
const SESSION_ONLY_KEYS = ['fv.community.draft.v1'];

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
function writeOwner(id: string | null) {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id);
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    /* storage unavailable: nothing was persisted either */
  }
}

export function AccountDataGuard({ children }: { children: ReactNode }) {
  const session = useSession();
  const qc = useQueryClient();
  const { clearFarm } = useFarm();
  const { resetToFarmArea } = useCommunityArea();

  const ready = session.isSuccess;
  const userId = session.data?.authenticated ? (session.data.user?.id ?? null) : null;

  // Layout effect: runs before the browser paints, so the previous account's farm is never shown.
  useLayoutEffect(() => {
    if (!ready) return; // unknown yet (loading, or the API is unreachable): change nothing
    const owner = readOwner();
    if (owner === userId) return; // same account, or still logged out

    // Another account logged in / signed up, or the user logged out: forget the previous account's data.
    clearFarm();
    resetToFarmArea();
    clearRecommendStorage();
    try {
      for (const k of SESSION_ONLY_KEYS) sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
    // Drop cached server answers from the previous account (the session itself is kept).
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    writeOwner(userId);
  }, [ready, userId]); // eslint-disable-line react-hooks/exhaustive-deps -- run only when the account changes

  return <>{children}</>;
}
