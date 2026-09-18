// Universal Filter System — the condition/group model behind the "Filter" button on list
// screens. Ported from V1 (`src/types/filters.ts`) so the operator vocabulary and the shape a
// saved filter serialises to stay identical across the two apps.

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "greater_equal"
  | "less_equal"
  | "is_empty"
  | "is_not_empty"
  | "in"
  | "not_in"
  | "between"
  | "before"
  | "after"
  | "on"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days";

export type FilterFieldType = "text" | "number" | "currency" | "single_select" | "multi_select" | "date" | "boolean";

export type FilterFieldOption = { value: string; label: string };

export type FilterFieldDefinition = {
  /** Dot path into the flattened record the matcher runs against, e.g. `category.slug`. */
  fieldId: string;
  label: string;
  type: FilterFieldType;
  options?: FilterFieldOption[];
  operators: FilterOperator[];
};

export type FilterValue = string | string[] | number | null;

export type FilterCondition = {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: FilterValue;
};

export type FilterLogic = "and" | "or";

export type FilterGroup = {
  id: string;
  logic: FilterLogic;
  conditions: FilterCondition[];
};

export type FilterConfig = {
  logic: FilterLogic;
  groups: FilterGroup[];
};

export type SavedFilter = {
  id: string;
  module_key: string;
  name: string;
  filter_config: FilterConfig;
  created_at: string;
};

export const EMPTY_FILTER_CONFIG: FilterConfig = { logic: "and", groups: [] };

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  greater_than: "greater than",
  less_than: "less than",
  greater_equal: "at least",
  less_equal: "at most",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  in: "is any of",
  not_in: "is none of",
  between: "between",
  before: "before",
  after: "after",
  on: "on",
  this_week: "this week",
  this_month: "this month",
  this_quarter: "this quarter",
  this_year: "this year",
  last_7_days: "last 7 days",
  last_30_days: "last 30 days",
  last_90_days: "last 90 days",
};

export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  text: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "is_empty", "is_not_empty"],
  number: ["equals", "not_equals", "greater_than", "less_than", "greater_equal", "less_equal", "between", "is_empty", "is_not_empty"],
  currency: ["equals", "not_equals", "greater_than", "less_than", "greater_equal", "less_equal", "between", "is_empty", "is_not_empty"],
  single_select: ["equals", "not_equals", "in", "not_in", "is_empty", "is_not_empty"],
  multi_select: ["in", "not_in", "is_empty", "is_not_empty"],
  date: ["on", "before", "after", "between", "this_week", "this_month", "this_quarter", "this_year", "last_7_days", "last_30_days", "last_90_days", "is_empty", "is_not_empty"],
  boolean: ["equals"],
};

/** Operators that are complete on their own — the panel renders no value input for them. */
export const NO_VALUE_OPERATORS: FilterOperator[] = [
  "is_empty", "is_not_empty", "this_week", "this_month", "this_quarter", "this_year",
  "last_7_days", "last_30_days", "last_90_days",
];
