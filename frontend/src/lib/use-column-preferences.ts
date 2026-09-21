"use client";

import { useCallback, useMemo, useState } from "react";

export const MAX_FROZEN_COLUMNS = 3;

export type ColumnDefinition = {
  key: string;
  label: string;
  sortable?: boolean;
  /** Locked columns can never be hidden — they're the row's identity and its actions. */
  locked?: boolean;
  defaultVisible?: boolean;
  defaultFrozen?: boolean;
};

type ColumnPreferences = {
  visibleColumns: string[];
  columnOrder: string[];
  frozenColumns: string[];
};

// V1 persists these in a `user_column_preferences` row. V3 has no such endpoint yet, so the
// choice is kept per-browser under this key — same state shape, so it can move server-side
// later without the callers changing.
const STORAGE_KEY = "globaly_column_preferences";

function readStore(): Record<string, ColumnPreferences> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, ColumnPreferences>;
  } catch {
    return {};
  }
}

function writeStore(next: Record<string, ColumnPreferences>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota/private-mode failures just mean the choice doesn't survive a reload.
  }
}

/** Drops keys that no longer exist in the column set, so a renamed column can't strand a row. */
function reconcile(stored: ColumnPreferences | undefined, defaults: ColumnPreferences, keys: Set<string>): ColumnPreferences {
  if (!stored) return defaults;
  const known = (list: string[] | undefined, fallback: string[]) =>
    Array.isArray(list) ? list.filter((k) => keys.has(k)) : fallback;
  // Columns added after the preference was stored are appended rather than silently lost.
  const order = known(stored.columnOrder, defaults.columnOrder);
  const missing = defaults.columnOrder.filter((k) => !order.includes(k));
  return {
    visibleColumns: known(stored.visibleColumns, defaults.visibleColumns),
    columnOrder: [...order, ...missing],
    frozenColumns: known(stored.frozenColumns, defaults.frozenColumns).slice(0, MAX_FROZEN_COLUMNS),
  };
}

export function useColumnPreferences({
  module,
  allColumns,
}: Readonly<{ module: string; allColumns: ColumnDefinition[] }>) {
  const defaults = useMemo<ColumnPreferences>(
    () => ({
      visibleColumns: allColumns.filter((c) => c.defaultVisible !== false).map((c) => c.key),
      columnOrder: allColumns.map((c) => c.key),
      frozenColumns: allColumns.filter((c) => c.defaultFrozen).map((c) => c.key),
    }),
    [allColumns],
  );

  const [prefs, setPrefs] = useState<ColumnPreferences>(() =>
    reconcile(readStore()[module], defaults, new Set(allColumns.map((c) => c.key))),
  );

  const update = useCallback(
    (updater: (prev: ColumnPreferences) => ColumnPreferences) =>
      setPrefs((prev) => {
        const next = updater(prev);
        writeStore({ ...readStore(), [module]: next });
        return next;
      }),
    [module],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      if (allColumns.find((c) => c.key === key)?.locked) return;
      update((prev) => ({
        ...prev,
        visibleColumns: prev.visibleColumns.includes(key)
          ? prev.visibleColumns.filter((k) => k !== key)
          : [...prev.visibleColumns, key],
        // Hiding a pinned column unpins it, or the frozen block keeps a slot for nothing.
        frozenColumns: prev.visibleColumns.includes(key) ? prev.frozenColumns.filter((k) => k !== key) : prev.frozenColumns,
      }));
    },
    [allColumns, update],
  );

  const toggleFreeze = useCallback(
    (key: string) =>
      update((prev) => {
        if (prev.frozenColumns.includes(key)) return { ...prev, frozenColumns: prev.frozenColumns.filter((k) => k !== key) };
        if (prev.frozenColumns.length >= MAX_FROZEN_COLUMNS) return prev;
        return { ...prev, frozenColumns: [...prev.frozenColumns, key] };
      }),
    [update],
  );

  const resetToDefaults = useCallback(() => update(() => defaults), [defaults, update]);

  /** Visible columns in display order, with locked ones forced in even if a stale preference hid them. */
  const orderedVisibleColumns = useMemo(() => {
    const visible = new Set(prefs.visibleColumns);
    for (const col of allColumns) if (col.locked) visible.add(col.key);
    return prefs.columnOrder.filter((key) => visible.has(key));
  }, [allColumns, prefs]);

  return {
    visibleColumns: prefs.visibleColumns,
    frozenColumns: prefs.frozenColumns,
    orderedVisibleColumns,
    toggleColumn,
    toggleFreeze,
    resetToDefaults,
  };
}
