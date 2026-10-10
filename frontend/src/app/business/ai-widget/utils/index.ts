import type { KeyboardEvent } from "react";
import type { DeveloperContact, VisitorProfileEntry, WidgetVisitor } from "../apis/types";

/**
 * Fold a send's response into the recipient list the card is already showing.
 *
 * `fromServer` is the whole list as it stood when the send READ it, so adopting it wholesale
 * undoes anything that changed while the send was in flight — a Remove that completed in that
 * window would put the deleted address straight back on screen.
 *
 * So a current row is replaced only by a row the server actually handed back for it. Absent is
 * never a deletion: the read-back can fail server-side and come through empty, and dropping a
 * visible row on that would make a successful resend look like it un-sent itself (Greptile).
 * Rows the send never touched keep whatever state the card has — including gone.
 *
 * Replaced rows go first, matching the server's own newest-sent-first ordering.
 */
export function mergeSentRecipients(
  current: DeveloperContact[],
  sent: string[],
  fromServer: DeveloperContact[],
): DeveloperContact[] {
  const justSent = new Set(sent);
  const fresh = fromServer.filter((r) => justSent.has(r.email));
  const replaced = new Set(fresh.map((r) => r.email));
  return [...fresh, ...current.filter((d) => !replaced.has(d.email))];
}

/**
 * What to call someone who never told us their name.
 *
 * "Anonymous visitor" rather than a blank or a dash: the row is a real person who really did
 * have a conversation, and an empty cell reads as missing data rather than as the normal,
 * expected state it actually is (most visitors never fill the card in).
 */
export function visitorDisplayName(v: Pick<WidgetVisitor, "name">): string {
  return v.name?.trim() || "Anonymous visitor";
}

/** Two letters for the avatar — "?" when there is no name to take them from. */
export function visitorInitials(v: Pick<WidgetVisitor, "name">): string {
  const name = v.name?.trim();
  if (!name) return "?";
  const [first = "", second = ""] = name.split(/\s+/);
  return `${first[0] ?? ""}${second[0] ?? ""}`.toUpperCase() || "?";
}

/**
 * The resolved country, with the visitor's own wording beside it when the two differ — so a bad
 * resolution ("Kashmiri" → nothing, "Nepali" → Nepal) is visible rather than hidden.
 */
export function visitorNationality(v: Pick<WidgetVisitor, "nationality" | "nationality_raw">): string | null {
  return v.nationality && v.nationality_raw && v.nationality_raw !== v.nationality
    ? `${v.nationality} (said “${v.nationality_raw}”)`
    : v.nationality ?? v.nationality_raw;
}

/** `sub_scores` is the one nested value in a profile entry; everything else is a scalar. */
function profileValue(value: VisitorProfileEntry[string]): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    return Object.entries(value).map(([k, v]) => `${humanizeKey(k)} ${v}`).join(", ");
  }
  return value;
}

/** `degree_title` → `Degree title`. The keys come from the platform_user_* columns verbatim. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One profile entry as `Label: value` pairs, with the empties dropped. */
export function profilePairs(entry: VisitorProfileEntry): { label: string; value: string }[] {
  return Object.entries(entry)
    .map(([key, raw]) => ({ label: humanizeKey(key), value: profileValue(raw) }))
    .filter((p) => p.value !== "");
}

const CSV_COLUMNS = ["Name", "Email", "Status", "Messages", "First seen", "Last activity"] as const;

/**
 * RFC-4180 quoting: every field is quoted and inner quotes are doubled.
 *
 * Quoting unconditionally rather than only when a comma appears — a name with a comma in it is
 * exactly the row nobody tests, and the check costs more than just always quoting.
 *
 * Quoting does not stop Excel/Sheets evaluating a cell that starts with = + - @, and names here
 * are typed by anonymous widget visitors — so a leading apostrophe defuses them, the same guard
 * the subscriber export uses.
 */
function csvCell(value: string): string {
  const defused = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${defused.replace(/"/g, '""')}"`;
}

export function visitorsToCsv(rows: WidgetVisitor[]): string {
  const lines = rows.map((v) =>
    [
      visitorDisplayName(v),
      v.email ?? "",
      v.status === "lead" ? "Lead" : "Visitor",
      String(v.message_count),
      new Date(v.first_seen_at).toISOString(),
      new Date(v.last_activity_at).toISOString(),
    ].map(csvCell).join(","),
  );
  return [CSV_COLUMNS.map(csvCell).join(","), ...lines].join("\n");
}

/** Hand the browser a file. ponytail: an anchor + object URL, no download library. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel read the file as UTF-8 rather than mangling accented names.
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const RADIO_STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * Keyboard for a hand-built `role="radiogroup"` (WAI-ARIA radio pattern): put it on the group's
 * onKeyDown and give only the checked radio `tabIndex={0}` (the rest -1), so the group is one Tab
 * stop and the arrow keys move focus *and* selection, wrapping at the ends. Selecting is a
 * `click()`, so each radio's own onClick stays the only place that changes state.
 */
export function radioGroupKeyDown(e: KeyboardEvent<HTMLElement>): void {
  const step = RADIO_STEP[e.key];
  if (!step) return;
  const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  const next = radios[(i + step + radios.length) % radios.length];
  next?.focus();
  next?.click();
}

/** The roving tabIndex for radio `index`: the checked one, or the first when none is (a custom hex). */
export function radioTabIndex(checked: boolean, index: number, anyChecked: boolean): 0 | -1 {
  return checked || (!anyChecked && index === 0) ? 0 : -1;
}
