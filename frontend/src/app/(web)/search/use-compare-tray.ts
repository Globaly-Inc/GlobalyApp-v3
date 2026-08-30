"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CompareCourseItem } from "./types";

const MAX_COMPARE_ITEMS = 5;
const STORAGE_KEY = "compare-items";

function loadFromStorage(): CompareCourseItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompareCourseItem[]) : [];
  } catch {
    return [];
  }
}

function persist(next: CompareCourseItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage quota exceeded or private mode — silently fall back to in-memory only
  }
}

// Always start empty on both server and client — prevents hydration mismatch.
// loadFromStorage() is called in a useEffect after hydration (see useCompareTray).
let items: CompareCourseItem[] = [];
let storageLoaded = false;
// Stable reference for the server snapshot — a new [] on every call triggers an infinite loop.
const EMPTY_SNAPSHOT: CompareCourseItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const store = {
  getItems: () => items,
  add: (c: CompareCourseItem) => {
    if (items.some((i) => i.id === c.id)) return;
    if (items.length >= MAX_COMPARE_ITEMS) return;
    items = [...items, c];
    persist(items);
    emit();
  },
  remove: (id: string) => {
    items = items.filter((i) => i.id !== id);
    persist(items);
    emit();
  },
  clear: () => {
    items = [];
    persist(items);
    emit();
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Search-page course compare tray — module-level singleton backed by localStorage
// so the floating tray, course cards, and the /compare page all share the same
// selection without prop drilling, and new tabs open with the full selection intact.
export function useCompareTray() {
  // Server snapshot () => [] matches the initial client state — no hydration mismatch.
  // After mount, read localStorage once and emit so all subscribers update together.
  const snapshot = useSyncExternalStore(subscribe, store.getItems, () => EMPTY_SNAPSHOT);

  useEffect(() => {
    if (storageLoaded) return;
    storageLoaded = true;
    const stored = loadFromStorage();
    if (stored.length) {
      items = stored;
      emit();
    }
  }, []);

  return {
    items: snapshot,
    max: MAX_COMPARE_ITEMS,
    add: store.add,
    remove: store.remove,
    clear: store.clear,
    has: (id: string) => snapshot.some((i) => i.id === id),
    isFull: snapshot.length >= MAX_COMPARE_ITEMS,
  };
}
