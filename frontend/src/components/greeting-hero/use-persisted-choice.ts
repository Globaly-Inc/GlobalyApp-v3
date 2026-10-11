"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener); // keeps two open tabs in step
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * Read-and-write a localStorage preference without a setState-in-effect.
 *
 * useSyncExternalStore is the sanctioned way to read a browser store: the server snapshot is the fallback,
 * so SSR and the first client render agree (no hydration mismatch) and React re-reads after mount.
 */
export function usePersistedChoice<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const stored = localStorage.getItem(key);
      return stored && isValid(stored) ? stored : fallback;
    },
    () => fallback,
  );

  const set = useCallback(
    (next: T) => {
      localStorage.setItem(key, next);
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, set];
}
