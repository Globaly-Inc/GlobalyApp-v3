"use client";

import { useState } from "react";
import type { Business, ListingRef } from "../apis/types";

/** Row selection for the businesses list, plus the eligibility filters the bulk actions use. */
export function useBusinessSelection(businesses: Business[]) {
  // The list mixes both tables, so business 19 and institution 19 are different rows with the
  // same id — row identity (React keys, selection) must be {kind, id}, not id alone.
  const keyOf = (b: Business) => `${b.kind}-${b.id}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleKeys = businesses.map(keyOf);
  const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const someSelected = selected.size > 0;

  /** The selected rows as {kind, id} refs — every mutation routes by kind. */
  const selectedRefs = (): ListingRef[] =>
    [...selected].map((k) => {
      const [kind, id] = k.split("-");
      return { kind: kind as ListingRef["kind"], id: Number(id) };
    });

  // Selection survives pagination/filter changes, but `businesses` only ever holds whatever
  // page is currently loaded — a selected row from another page has no entry here. Eligibility
  // filtering below only EXCLUDES a ref when we can positively confirm (from loaded data) that
  // it's ineligible; an off-page ref we know nothing about is kept rather than silently dropped
  // from the bulk action, which was the actual bug (not just an inaccurate displayed count).
  const businessByKey = () => new Map(businesses.map((b) => [keyOf(b), b]));

  /** Same eligibility rule as the per-row menu item (business-row-actions.tsx): every status except
   *  "claimed" — a pending request can be resent, only an already-claimed listing is excluded. */
  const selectedUnclaimedRefs = (): ListingRef[] => {
    const byKey = businessByKey();
    return selectedRefs().filter((r) => {
      const b = byKey.get(`${r.kind}-${r.id}`);
      return !b || b.claim_status !== "claimed";
    });
  };

  /** How many of the current selection are actually eligible for a given bulk status change —
   *  e.g. Verify shouldn't count/re-touch a business that's already verified. Off-page rows
   *  (unknown status) count as eligible, matching selectedEligibleRefs below. */
  const selectedEligibleCount = (targetStatus: Business["status"]): number =>
    selectedEligibleRefs(targetStatus).length;

  const selectedEligibleRefs = (targetStatus: Business["status"]): ListingRef[] => {
    const byKey = businessByKey();
    return selectedRefs().filter((r) => {
      const b = byKey.get(`${r.kind}-${r.id}`);
      return !b || b.status !== targetStatus;
    });
  };

  const toggleOne = (key: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allVisibleSelected) visibleKeys.forEach((k) => next.delete(k));
      else visibleKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  return {
    keyOf, selected, toggleOne, toggleAllVisible, clearSelection, allVisibleSelected, someSelected,
    selectedRefs, selectedUnclaimedRefs, selectedEligibleCount, selectedEligibleRefs,
  };
}
