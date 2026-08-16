import type { Country } from "../apis/types";

export type CountryPanelProps = Readonly<{
  country: Partial<Country>;
  onChange: (updates: Partial<Country>) => void;
  errors: Record<string, string>;
}>;
