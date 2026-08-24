"use client";

import { useEffect, useMemo, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { geoApi, type City, type Country } from "@/app/geo/apis";

/**
 * Country/city pickers backed by the real countries+cities API, used wherever a search tab
 * has no enumerable country/city facet of its own (courses, jobs, institutions, etc. store
 * country as free text — see search/page.tsx). Hidden inputs carry the picked names into the
 * surrounding native `<form method="get">` submit, same trick as ComboFilterField.
 */
export function DestinationFilterFields({
  country,
  city,
}: Readonly<{ country?: string; city?: string }>) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState(country ?? "");
  const [selectedCity, setSelectedCity] = useState(city ?? "");
  // Cached against the country it belongs to, so a stale city list can never show for a new country.
  const [cityCache, setCityCache] = useState<{ countryName: string; list: City[] }>({ countryName: "", list: [] });

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  const selectedCountryId = useMemo(
    () => countries.find((c) => c.name === selectedCountry)?.id,
    [countries, selectedCountry],
  );

  useEffect(() => {
    if (!selectedCountryId || cityCache.countryName === selectedCountry) return;
    let cancelled = false;
    geoApi
      .getCities(selectedCountryId)
      .then((list) => !cancelled && setCityCache({ countryName: selectedCountry, list }))
      .catch(() => !cancelled && setCityCache({ countryName: selectedCountry, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [selectedCountryId, selectedCountry, cityCache.countryName]);

  const countryOptions: ComboboxOption[] = useMemo(
    () => [{ value: "", label: "Any country" }, ...countries.map((c) => ({ value: c.name, label: c.name }))],
    [countries],
  );
  const cityOptions: ComboboxOption[] = useMemo(
    () => [
      { value: "", label: "Any city" },
      ...(cityCache.countryName === selectedCountry ? cityCache.list.map((c) => ({ value: c.name, label: c.name })) : []),
    ],
    [cityCache, selectedCountry],
  );

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="country" value={selectedCountry} />
      <input type="hidden" name="city" value={selectedCity} />
      <Combobox
        options={countryOptions}
        value={selectedCountry}
        // Changing country drops the city: the old one belongs somewhere else.
        onChange={(next) => {
          setSelectedCountry(next);
          setSelectedCity("");
        }}
        placeholder="Any country"
        searchPlaceholder="Search countries..."
      />
      <Combobox
        options={cityOptions}
        value={selectedCity}
        onChange={setSelectedCity}
        placeholder="Any city"
        searchPlaceholder="Search cities..."
        disabled={!selectedCountry}
        loading={!!selectedCountry && cityCache.countryName !== selectedCountry}
      />
    </div>
  );
}
