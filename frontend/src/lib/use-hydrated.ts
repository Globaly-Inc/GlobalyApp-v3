"use client";

import { useSyncExternalStore } from "react";

/**
 * False during SSR and on the hydrating render, true on every render after that.
 *
 * The problem it exists for: Next's router cache can rehydrate a previously-rendered
 * page's HTML against a client Redux store that has since moved on (after a
 * back/forward navigation, say), so `status`/`profile` in that cached HTML genuinely
 * disagree with the live store. Gating on this makes the first client render match
 * whatever HTML is being hydrated against, then swaps to the live values.
 *
 * Why not `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`:
 * that is a setState called synchronously inside an effect, which the react-hooks
 * lint rule rejects for triggering a cascading render — and it is a rule worth
 * keeping, because the pattern re-renders the whole shell one extra time on every
 * mount. useSyncExternalStore expresses the same "server says X, client says Y"
 * split directly, which is how the rest of this codebase reads browser-only state
 * (see personal/portal/utils/use-persisted-choice.ts).
 */

// Module scope so the identity is stable across renders. There is nothing to
// subscribe to: the value flips once, at hydration, and React re-renders then anyway.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
