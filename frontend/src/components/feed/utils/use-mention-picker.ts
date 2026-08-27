"use client";

import { useEffect, useState } from "react";
import { fetchMentionCandidates, mentionDisplayName } from "./mentions";
import type { Mention, MentionCandidate } from "../apis/types";

/** Finds the `@partial` token the caret is currently inside, if any — null means no mention popover. */
function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;
  const query = upToCaret.slice(at + 1);
  if (/\s/.test(query)) return null; // a space ends the mention token
  return { start: at, query };
}

/**
 * Shared @mention logic for any textarea-backed composer (post, comment). The caller owns the text value
 * itself — this hook only tracks which candidates are selected and where the dropdown should render.
 */
export function useMentionPicker() {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [selected, setSelected] = useState<Mention[]>([]);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Debounced server search — mirrors the 300ms pattern used by the admin members search box.
  useEffect(() => {
    if (!query) return;
    const timer = setTimeout(() => {
      fetchMentionCandidates(query.query || undefined).then(setCandidates);
    }, 300);
    return () => clearTimeout(timer);
  }, [query?.query]);

  const matches = query ? candidates.slice(0, 6) : [];

  /** Call on every change/caret move. `el` positions the portal dropdown — pass the live textarea element. */
  const onTextChange = (text: string, caret: number, el: HTMLTextAreaElement | null) => {
    const next = activeMentionQuery(text, caret);
    setQuery(next);
    // Fixed-position portal, computed fresh each time it opens — a plain absolutely-positioned dropdown
    // gets clipped by an ancestor's `overflow-hidden` (e.g. the post card, which uses it to round media).
    const rect = next ? el?.getBoundingClientRect() : null;
    setDropdownRect(rect ? { top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 224) } : null);
  };

  /** Returns the text with the in-progress `@query` replaced by the picked name — caller applies it. */
  const pick = (text: string, candidate: MentionCandidate): string => {
    if (!query) return text;
    const name = mentionDisplayName(candidate);
    const before = text.slice(0, query.start);
    const after = text.slice(query.start + 1 + query.query.length);
    setSelected((prev) => [
      ...prev.filter((m) => m.platform_user_id !== candidate.platform_user_id),
      { platform_user_id: candidate.platform_user_id, first_name: candidate.first_name, last_name: candidate.last_name },
    ]);
    setQuery(null);
    return `${before}@${name} ${after}`;
  };

  /** Only keep mentions whose @name is still actually present — editing after picking can leave stale ones. */
  const resolveMentions = (finalText: string): Mention[] =>
    selected.filter((m) => finalText.includes(`@${mentionDisplayName(m)}`));

  const reset = () => {
    setSelected([]);
    setQuery(null);
  };

  return { matches, dropdownRect, mentionActive: !!query, onTextChange, pick, resolveMentions, reset };
}
