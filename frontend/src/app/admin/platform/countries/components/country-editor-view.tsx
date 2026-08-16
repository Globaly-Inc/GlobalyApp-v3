"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/http";
import { countriesApi } from "../apis";
import type { Country, CountryInput } from "../apis/types";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { COUNTRY_EDITOR_TABS_EDIT, COUNTRY_EDITOR_TABS_NEW, type CountryEditorTab } from "../const";
import { generateSlug } from "../utils";
import { CountryBasicPanel } from "./country-basic-panel";
import { CountryImagesPanel } from "./country-images-panel";
import { CountryDetailsPanel } from "./country-details-panel";
import { CountryEducationPanel } from "./country-education-panel";
import { CountryVisaPanel } from "./country-visa-panel";
import { CountryWeatherPanel } from "./country-weather-panel";
import { CountrySeoPanel } from "./country-seo-panel";
import { CountryCitiesTab } from "./country-cities-tab";

const empty = (): Partial<Country> => ({
  name: "", slug: "", iso2: "", iso3: "", phone_code: null, currency: null, currency_symbol: null,
  region: null, is_active: true, flag_emoji: null, capital: null, languages: [], timezone: null, population: null,
  area_km2: null, about: null, why_study_here: null, hero_image_url: null, thumbnail_image_url: null,
  gallery_images: [], youtube_embed_url: null, visa_type: null, visa_description: null,
  visa_processing_time: null, visa_fee: null, avg_tuition_min: null, avg_tuition_max: null,
  avg_tuition_currency: null, student_count_label: null, universities_count_label: null,
  cost_of_living_label: null, work_rights_label: null, weather_summer: null, weather_autumn: null,
  weather_winter: null, weather_spring: null, is_featured: false, sort_order: 0, meta_title: null,
  meta_description: null,
});

export function CountryEditorView({ countryId }: Readonly<{ countryId: number | null }>) {
  const router = useRouter();
  const [country, setCountry] = useState<Partial<Country>>(empty);
  const [tab, setTab] = useState<CountryEditorTab>("basic");
  const [loading, setLoading] = useState(countryId !== null);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || countryId === null) return;
    fetchedRef.current = true;
    countriesApi.getCountryById(countryId).then(setCountry).catch(() => setNotFound(true)).finally(() => setLoading(false));
  }, [countryId]);

  const update = (updates: Partial<Country>) =>
    setCountry((c) => ({
      ...c,
      ...updates,
      ...(countryId === null && updates.name !== undefined ? { slug: generateSlug(updates.name) } : {}),
    }));

  const validate = () => {
    const next: typeof errors = {};
    if (!country.name?.trim()) next.name = "Name is required";
    if (!country.slug?.trim()) next.slug = "Slug is required";
    if (country.iso2?.length !== 2) next.iso2 = "ISO2 must be 2 letters";
    if (country.iso3?.length !== 3) next.iso3 = "ISO3 must be 3 letters";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const input = country as CountryInput;
      if (countryId) {
        await countriesApi.updateCountry(countryId, input);
      } else {
        await countriesApi.createCountry(input);
      }
      toast.success(countryId ? "Country updated" : "Country created");
      router.push("/admin/platform/countries");
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        setErrors((e) => ({ ...e, slug: err.message }));
        toast.error("Slug already in use", { description: "Pick a different slug." });
      } else {
        toast.error("Something went wrong", { description: err instanceof Error ? err.message : "Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return <p className="py-20 text-center text-sm text-muted-foreground">Country not found.</p>;
  }

  const panelProps = { country, onChange: update, errors };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/admin/platform/countries")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Globe className="h-5 w-5" /> {countryId ? `Edit ${country.name}` : "Add New Country"}
          </h1>
        </div>
        <Button className="gap-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {countryId ? "Save Country" : "Create Country"}
        </Button>
      </div>

      <AdminSegmentedTabs options={countryId ? COUNTRY_EDITOR_TABS_EDIT : COUNTRY_EDITOR_TABS_NEW} value={tab} onChange={setTab} />

      {tab === "basic" && <CountryBasicPanel {...panelProps} />}
      {tab === "images" && <CountryImagesPanel {...panelProps} />}
      {tab === "details" && <CountryDetailsPanel {...panelProps} />}
      {tab === "education" && <CountryEducationPanel {...panelProps} />}
      {tab === "visa" && <CountryVisaPanel {...panelProps} />}
      {tab === "weather" && <CountryWeatherPanel {...panelProps} />}
      {tab === "seo" && <CountrySeoPanel {...panelProps} />}
      {tab === "cities" && countryId && <CountryCitiesTab countryId={countryId} />}
    </div>
  );
}
