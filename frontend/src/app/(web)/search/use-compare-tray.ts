"use client";

import { useSyncExternalStore } from "react";
import type { CompareCourseItem } from "./types";

const MAX_COMPARE_ITEMS = 5;

let items: CompareCourseItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const store = {
  getItems: () => items,
  add: (c: CompareCourseItem) => {
    if (items.some((i) => i.id === c.id)) return;
    if (items.length >= MAX_COMPARE_ITEMS) return;
    items = [...items, c];
    emit();
  },
  remove: (id: string) => {
    items = items.filter((i) => i.id !== id);
    emit();
  },
  clear: () => {
    items = [];
    emit();
  },
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// Search-page course compare tray — module-level singleton (in-memory only,
// resets on full page reload) so the floating tray, course cards, and the
// /compare page all share the same selection without prop drilling.
export function useCompareTray() {
  const snapshot = useSyncExternalStore(subscribe, store.getItems, store.getItems);
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
