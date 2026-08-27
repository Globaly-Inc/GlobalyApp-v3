"use client";

import { useSyncExternalStore } from "react";
import { httpGet, httpPost } from "@/lib/api/http";
import { getAccessToken } from "@/lib/session";

// Saved ("hearted") courses and institutions — module-level singleton in the same shape as
// use-compare-tray, so every card on the page shares one set instead of each fetching its own
// state. The list is fetched once per page load, lazily, the first time a card mounts.

export type SavedItemType = "course" | "institution";

/** Type and id together — a course UUID and an institution fragment can't collide, but keying on
 *  both keeps the set honest if a third type is ever added. */
const key = (type: SavedItemType, id: string) => `${type}:${id}`;

let saved = new Set<string>();
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const getSnapshot = () => saved;
// The server render has no session, so every card starts un-hearted and hydrates from the fetch.
const EMPTY: Set<string> = new Set();
const getServerSnapshot = () => EMPTY;

function subscribe(cb: () => void) {
  listeners.add(cb);
  void load();
  return () => listeners.delete(cb);
}

function load(): Promise<void> {
  if (!getAccessToken()) return Promise.resolve();
  loadPromise ??= httpGet<{ items: { item_type: SavedItemType; item_id: string }[] }>("/saved")
    .then(({ items }) => {
      saved = new Set(items.map((i) => key(i.item_type, i.item_id)));
      emit();
    })
    // A signed-out or expired session just means nothing is saved — the heart stays hollow.
    .catch(() => undefined);
  return loadPromise;
}

function setLocal(k: string, isSaved: boolean) {
  const next = new Set(saved);
  if (isSaved) next.add(k); else next.delete(k);
  saved = next;
  emit();
}

/**
 * Optimistic toggle: the heart fills immediately and reverts if the request fails, so a slow
 * network never leaves the button feeling unresponsive.
 */
async function toggle(type: SavedItemType, id: string): Promise<void> {
  const k = key(type, id);
  const before = saved.has(k);
  setLocal(k, !before);
  try {
    const { is_saved } = await httpPost<{ is_saved: boolean }>(`/saved/${type}/${id}`, {});
    setLocal(k, is_saved);
  } catch (err) {
    setLocal(k, before);
    throw err;
  }
}

export function useSavedItems() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    has: (type: SavedItemType, id: string) => snapshot.has(key(type, id)),
    count: snapshot.size,
    toggle,
    isSignedIn: Boolean(getAccessToken()),
  };
}
