import type { SegmentOption } from "../../../components/admin-segmented-tabs";

export type CountryFilter = "all" | "active" | "featured";

export const COUNTRY_FILTER_TABS: SegmentOption<CountryFilter>[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "featured", label: "Featured" },
];

export type CountryEditorTab = "basic" | "images" | "details" | "education" | "visa" | "weather" | "seo" | "cities";

export const COUNTRY_EDITOR_TABS_NEW: SegmentOption<CountryEditorTab>[] = [
  { value: "basic", label: "Basic" },
  { value: "images", label: "Images" },
  { value: "details", label: "Details" },
  { value: "education", label: "Education" },
  { value: "visa", label: "Visa" },
  { value: "weather", label: "Weather" },
  { value: "seo", label: "SEO" },
];

export const COUNTRY_EDITOR_TABS_EDIT: SegmentOption<CountryEditorTab>[] = [
  ...COUNTRY_EDITOR_TABS_NEW,
  { value: "cities", label: "Cities" },
];
