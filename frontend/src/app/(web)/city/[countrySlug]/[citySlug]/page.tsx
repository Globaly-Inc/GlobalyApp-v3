import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCityBySlug } from "../../api";
import { getCourses, getEducationAgencies, getInstitutions } from "../../../search/api";
import { PlaceCounselors, PlaceInstitutions, PlaceServices } from "../../../components/place-sections";
import { CityHero } from "../../components/city-hero";
import { CityKeyFacts } from "../../components/city-key-facts";
import { CityAbout } from "../../components/city-about";
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

  const emptyPage = { data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } };
  const [institutionsRes, agentsRes, coursesRes] = await Promise.all([
    getInstitutions({ city: city.name }).catch(() => emptyPage),
    getEducationAgencies({ city: city.name }).catch(() => emptyPage),
    getCourses({ city: city.name }).catch(() => emptyPage),
  ]);

  return (
    <div>
      <CityHero city={city} />
      <CityKeyFacts city={city} />

      <div className="container mx-auto space-y-12 px-4 py-10 md:space-y-20 md:py-16">
        <CityAbout city={city} />
        <PlaceInstitutions placeName={city.name} scope="city" countryName={city.country.name} institutions={institutionsRes.data.slice(0, 6)} />
        <PlaceServices placeName={city.name} scope="city" countryName={city.country.name} courses={coursesRes.data.slice(0, 6)} />
        <PlaceCounselors placeName={city.name} scope="city" countryName={city.country.name} agents={agentsRes.data.slice(0, 6)} />
        <CityCta cityName={city.name} country={city.country} />
      </div>
    </div>
  );
}
