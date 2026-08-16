import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCountryBySlug } from "../api";
import { getPosts } from "../../blog/api";
import { CountryHero } from "../components/country-hero";
import { CountryKeyFacts } from "../components/country-key-facts";
import { CountryAbout } from "../components/country-about";
import { CountryCities } from "../components/country-cities";
import { CountryWeather } from "../components/country-weather";
import { CountryLiving } from "../components/country-living";
import { CountryPlatformStats } from "../components/country-platform-stats";
import { CountryInstitutions } from "../components/country-institutions";
import { CountryBlog } from "../components/country-blog";
import { CountryCta } from "../components/country-cta";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>): Promise<Metadata> {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  if (!country) return { title: "Country not found — Globaly" };
  const title = country.meta_title ?? `Study in ${country.name} — Courses, Institutions & Costs | Globaly`;
  const description = (country.meta_description ?? country.why_study_here ?? "").slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, images: country.hero_image_url ? [country.hero_image_url] : undefined },
  };
}

export default async function CountryPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const country = await getCountryBySlug(slug);
  if (!country) notFound();

  const { data: allPosts } = await getPosts({}).catch(() => ({ data: [] }));
  const nameLower = country.name.toLowerCase();
  const relatedPosts = allPosts
    .filter((p) => p.tags.some((t) => t.toLowerCase() === nameLower) || p.title.toLowerCase().includes(nameLower))
    .slice(0, 3);

  return (
    <div>
      <CountryHero country={country} />
      <CountryKeyFacts country={country} />

      <div className="container mx-auto space-y-20 px-4 py-16">
        <CountryAbout country={country} />
        <CountryCities country={country} />
        <CountryWeather country={country} />
        <CountryLiving country={country} />
      </div>

      <CountryPlatformStats country={country} />

      <div className="container mx-auto space-y-20 px-4 py-16">
        <CountryInstitutions countryName={country.name} />
        <CountryBlog posts={relatedPosts} />
        <CountryCta countryName={country.name} />
      </div>
    </div>
  );
}
