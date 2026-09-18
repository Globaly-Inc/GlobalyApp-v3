"use client";

import { useCallback, useMemo, useState } from "react";
import { countActiveConditions } from "@/lib/filter-matcher";
import {
  EMPTY_FILTER_CONFIG,
  type FilterCondition,
  type FilterConfig,
  type FilterFieldDefinition,
  type FilterLogic,
  type SavedFilter,
} from "@/components/filters/types";

// V1 keeps saved filters in a `saved_filters` Supabase table. V3 has no such endpoint, so they
// live per-browser under this key instead — the panel, the config shape and the serialised
// filter are identical, so moving them server-side later is a swap of these two functions.
const SAVED_FILTERS_KEY = "globaly_saved_filters";

type SavedFilterStore = Record<string, { filters: SavedFilter[]; defaultId: string | null }>;

function readStore(): SavedFilterStore {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) ?? "{}") as SavedFilterStore;
  } catch {
    return {};
  }
}

function writeStore(next: SavedFilterStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
  } catch {
    // Private-mode / quota failures must not take the filter panel down with them.
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * State for one module's filter panel: the live condition tree, plus that module's saved
 * filters. `fieldDefinitions` decides which fields a new condition can pick and which operator
 * it starts on.
 */
export function useUniversalFilter({
  moduleKey,
  fieldDefinitions,
}: Readonly<{ moduleKey: string; fieldDefinitions: FilterFieldDefinition[] }>) {
  // Reading localStorage in a state initialiser would normally risk a hydration mismatch, but
  // every screen using this sits behind a client-only loading gate, so the server and the first
  // client render both show the spinner, not the table.
  const [saved, setSaved] = useState(() => readStore()[moduleKey] ?? { filters: [], defaultId: null });
  // Starring a filter as the default has to actually apply it on the next visit, or the star is
  // decoration — so the live config starts as that filter's, not empty.
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(
    () => saved.filters.find((f) => f.id === saved.defaultId)?.filter_config ?? EMPTY_FILTER_CONFIG,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  // Which saved filter the live config came from, or null once it is the user's own working state.
  // Tracked by id rather than by comparing values: two saved filters may hold identical configs,
  // and deleting one of those must not disturb a session that is running the other.
  const [appliedFilterId, setAppliedFilterId] = useState<string | null>(
    () => (saved.filters.some((f) => f.id === saved.defaultId) ? saved.defaultId : null),
  );

  /** Every hand edit detaches the live config from whichever saved filter seeded it. */
  const editConfig = useCallback((updater: (prev: FilterConfig) => FilterConfig) => {
    setFilterConfig(updater);
    setAppliedFilterId(null);
  }, []);

  const persist = useCallback(
    (next: { filters: SavedFilter[]; defaultId: string | null }) => {
      setSaved(next);
      writeStore({ ...readStore(), [moduleKey]: next });
    },
    [moduleKey],
  );

  const mapGroup = useCallback(
    (groupId: string, fn: (g: FilterConfig["groups"][number]) => FilterConfig["groups"][number]) =>
      editConfig((prev) => ({ ...prev, groups: prev.groups.map((g) => (g.id === groupId ? fn(g) : g)) })),
    [editConfig],
  );

  const addGroup = useCallback(
    () => editConfig((prev) => ({ ...prev, groups: [...prev.groups, { id: newId(), logic: "and", conditions: [] }] })),
    [editConfig],
  );

  const removeGroup = useCallback(
    (groupId: string) => editConfig((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== groupId) })),
    [editConfig],
  );

  const addCondition = useCallback(
    (groupId: string) => {
      const field = fieldDefinitions[0];
      const operator = field?.operators[0];
      // A field with no operators can't produce a condition anyone could complete.
      if (!field || !operator) return;
      const condition: FilterCondition = { id: newId(), fieldId: field.fieldId, operator, value: null };
      mapGroup(groupId, (g) => ({ ...g, conditions: [...g.conditions, condition] }));
    },
    [fieldDefinitions, mapGroup],
  );

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, updates: Partial<FilterCondition>) =>
      mapGroup(groupId, (g) => ({
        ...g,
        conditions: g.conditions.map((c) => (c.id === conditionId ? { ...c, ...updates } : c)),
      })),
    [mapGroup],
  );

  const removeCondition = useCallback(
    (groupId: string, conditionId: string) =>
      mapGroup(groupId, (g) => ({ ...g, conditions: g.conditions.filter((c) => c.id !== conditionId) })),
    [mapGroup],
  );

  const setGroupLogic = useCallback(
    (groupId: string, logic: FilterLogic) => mapGroup(groupId, (g) => ({ ...g, logic })),
    [mapGroup],
  );

  const setTopLogic = useCallback((logic: FilterLogic) => editConfig((prev) => ({ ...prev, logic })), [editConfig]);

  const clearFilters = useCallback(() => editConfig(() => EMPTY_FILTER_CONFIG), [editConfig]);

  const saveFilter = useCallback(
    (name: string) => {
      const filter: SavedFilter = {
        id: newId(),
        module_key: moduleKey,
        name,
        filter_config: filterConfig,
        created_at: new Date().toISOString(),
      };
      persist({ ...saved, filters: [...saved.filters, filter] });
      // What's on screen is now that saved filter, not loose working state.
      setAppliedFilterId(filter.id);
    },
    [filterConfig, moduleKey, persist, saved],
  );

  const applySavedFilter = useCallback((filter: SavedFilter) => {
    setFilterConfig(filter.filter_config);
    setAppliedFilterId(filter.id);
  }, []);

  const setDefaultFilter = useCallback(
    (filterId: string | null) => {
      persist({ ...saved, defaultId: filterId });
      // Apply it immediately too — starring a filter you can already see should not need a reload
      // to take effect.
      const starred = saved.filters.find((f) => f.id === filterId);
      if (starred) {
        setFilterConfig(starred.filter_config);
        setAppliedFilterId(starred.id);
      }
    },
    [persist, saved],
  );

  const deleteFilter = useCallback(
    (filterId: string) => {
      persist({
        filters: saved.filters.filter((f) => f.id !== filterId),
        defaultId: saved.defaultId === filterId ? null : saved.defaultId,
      });
      // Deleting the filter currently on screen would otherwise leave its conditions applied now
      // but gone after a reload (nothing seeds them any more) — one action, two result sets.
      // Strictly the applied one: deleting a different filter that merely holds the same
      // conditions leaves this session alone, and once the user has edited what they applied it
      // is their own working state, which tidying up a bookmark must not discard.
      if (appliedFilterId === filterId) {
        setFilterConfig(EMPTY_FILTER_CONFIG);
        setAppliedFilterId(null);
      }
    },
    [appliedFilterId, persist, saved],
  );

  const activeCount = useMemo(() => countActiveConditions(filterConfig), [filterConfig]);

  return {
    filterConfig,
    activeCount,
    panelOpen,
    setPanelOpen,
    savedFilters: saved.filters,
    defaultFilterId: saved.defaultId,
    addGroup,
    removeGroup,
    addCondition,
    updateCondition,
    removeCondition,
    setGroupLogic,
    setTopLogic,
    clearFilters,
    saveFilter,
    applySavedFilter,
    setDefaultFilter,
    deleteFilter,
  };
}

export type UniversalFilter = ReturnType<typeof useUniversalFilter>;
