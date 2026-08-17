import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCityBySlug } from "../../api";
import { CityHero } from "../../components/city-hero";
import { CityKeyFacts } from "../../components/city-key-facts";
import { CityAbout } from "../../components/city-about";
import { CityInstitutions } from "../../components/city-institutions";
import { CityCta } from "../../components/city-cta";

type Params = { countrySlug: string; citySlug: string };

export async function generateMetadata({ params }: Readonly<{ params: Promise<Params> }>): Promise<Metadata> {
  const { countrySlug, citySlug } = await params;
  const city = await getCityBySlug(citySlug, countrySlug);
  if (!city) return { title: "City not found — Globaly" };
  const title = city.meta_title ?? `Study in ${city.name}, ${city.country.name} — Globaly`;
  const description = (city.meta_description ?? `Explore universities, courses and student life in ${city.name}, ${city.country.name}.`).slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, images: city.hero_image_url ? [city.hero_image_url] : undefined },
  };
}

export default async function CityPage({ params }: Readonly<{ params: Promise<Params> }>) {
  const { countrySlug, citySlug } = await params;
  const city = await getCityBySlug(citySlug, countrySlug);
  if (!city) notFound();

  return (
    <div>
      <CityHero city={city} />
      <CityKeyFacts city={city} />

      <div className="container mx-auto space-y-20 px-4 py-16">
        <CityAbout city={city} />
        <CityInstitutions cityName={city.name} />
        <CityCta cityName={city.name} country={city.country} />
      </div>
    </div>
  );
}
