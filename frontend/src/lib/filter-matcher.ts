// Client-side evaluator for a `FilterConfig` — the same semantics V1's `filterClientMatcher.ts`
// implements, minus date-fns (not a dependency here, so the presets are plain Date arithmetic).

import type { FilterCondition, FilterConfig, FilterGroup, FilterOperator } from "@/components/filters/types";

type DataRecord = Record<string, unknown>;

function getNestedValue(record: DataRecord, fieldId: string): unknown {
  let value: unknown = record;
  for (const part of fieldId.split(".")) {
    if (value == null) return null;
    value = (value as DataRecord)[part];
  }
  return value;
}

function toStr(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(",");
  return String(v);
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toDate(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local midnight, so "on 2026-05-01" matches any time of day on that date. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysAgo(n: number): number {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getTime();
}

/** Inclusive [from, to) window for each relative preset, in epoch ms. */
function presetWindow(operator: FilterOperator): [number, number] | null {
  const now = new Date();
  const year = now.getFullYear();
  switch (operator) {
    case "this_week": {
      // Week starts Sunday, matching V1's date-fns default.
      const from = new Date(year, now.getMonth(), now.getDate() - now.getDay());
      return [from.getTime(), from.getTime() + 7 * 86_400_000];
    }
    case "this_month":
      return [new Date(year, now.getMonth(), 1).getTime(), new Date(year, now.getMonth() + 1, 1).getTime()];
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return [new Date(year, q, 1).getTime(), new Date(year, q + 3, 1).getTime()];
    }
    case "this_year":
      return [new Date(year, 0, 1).getTime(), new Date(year + 1, 0, 1).getTime()];
    case "last_7_days":
      return [daysAgo(7), Date.now()];
    case "last_30_days":
      return [daysAgo(30), Date.now()];
    case "last_90_days":
      return [daysAgo(90), Date.now()];
    default:
      return null;
  }
}

function compareNumbers(operator: FilterOperator, a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  switch (operator) {
    case "greater_than": return a > b;
    case "less_than": return a < b;
    case "greater_equal": return a >= b;
    default: return a <= b;
  }
}

function matchesText(operator: FilterOperator, raw: string, needle: string): boolean {
  switch (operator) {
    case "equals": return raw === needle;
    case "not_equals": return raw !== needle;
    case "contains": return raw.includes(needle);
    case "not_contains": return !raw.includes(needle);
    case "starts_with": return raw.startsWith(needle);
    default: return raw.endsWith(needle);
  }
}

function matchesMembership(operator: FilterOperator, rawValue: unknown, condValue: unknown): boolean {
  const wanted = (Array.isArray(condValue) ? condValue : [condValue]).map(String);
  const actual = Array.isArray(rawValue) ? rawValue.map(String) : [toStr(rawValue)];
  const hit = wanted.some((v) => actual.includes(v));
  return operator === "in" ? hit : !hit;
}

function evaluateCondition(record: DataRecord, cond: FilterCondition): boolean {
  const raw = getNestedValue(record, cond.fieldId);
  const op = cond.operator;

  if (op === "is_empty") return raw == null || toStr(raw) === "";
  if (op === "is_not_empty") return raw != null && toStr(raw) !== "";

  const window = presetWindow(op);
  if (window) {
    const d = toDate(raw);
    return d != null && d.getTime() >= window[0] && d.getTime() <= window[1];
  }

  const value = cond.value;

  if (op === "in" || op === "not_in") return matchesMembership(op, raw, value);

  if (op === "greater_than" || op === "less_than" || op === "greater_equal" || op === "less_equal") {
    return compareNumbers(op, toNum(raw), toNum(value));
  }

  if (op === "between") {
    if (!Array.isArray(value) || value.length < 2) return false;
    const [a, lo, hi] = [toNum(raw), toNum(value[0]), toNum(value[1])];
    return a != null && lo != null && hi != null && a >= lo && a <= hi;
  }

  if (op === "before" || op === "after" || op === "on") {
    const [a, b] = [toDate(raw), toDate(value)];
    if (a == null || b == null) return false;
    if (op === "on") return startOfDay(a) === startOfDay(b);
    return op === "before" ? a.getTime() < b.getTime() : a.getTime() > b.getTime();
  }

  return matchesText(op, toStr(raw).toLowerCase(), toStr(value).toLowerCase());
}

function evaluateGroup(record: DataRecord, group: FilterGroup): boolean {
  if (group.conditions.length === 0) return true;
  return group.logic === "and"
    ? group.conditions.every((c) => evaluateCondition(record, c))
    : group.conditions.some((c) => evaluateCondition(record, c));
}

export function applyClientFilter<T extends DataRecord>(rows: T[], config: FilterConfig): T[] {
  if (config.groups.length === 0) return rows;
  return rows.filter((row) =>
    config.logic === "and"
      ? config.groups.every((g) => evaluateGroup(row, g))
      : config.groups.some((g) => evaluateGroup(row, g)),
  );
}

export function countActiveConditions(config: FilterConfig): number {
  return config.groups.reduce((sum, g) => sum + g.conditions.length, 0);
}
