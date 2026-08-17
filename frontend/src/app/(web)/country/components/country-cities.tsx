"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { getCityFallbackImage } from "../hero-fallback";
import type { CountryDetail } from "../types";

function subscribeHoverCapability(callback: () => void) {
  const mq = window.matchMedia("(hover: hover)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
const getHoverCapability = () => window.matchMedia("(hover: hover)").matches;
const getHoverCapabilityServer = () => false;

function CityTile({
  city,
  image,
  active,
}: Readonly<{ city: CountryDetail["cities"][number]; image: string; active: boolean }>) {
  return (
    <div
      className={`relative mx-2 h-56 w-52 shrink-0 origin-center transition-[transform,opacity] duration-500 ease-out sm:mx-3 sm:h-72 sm:w-64 ${
        active ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.8] opacity-60"
      }`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-2xl bg-muted shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-5 text-center text-white">
          <p className="text-sm font-bold drop-shadow-sm sm:text-base">{city.name}</p>
          {city.population_label && <p className="mt-1 text-xs text-white/85 drop-shadow-sm">Pop. {city.population_label}</p>}
        </div>
      </div>
      {city.is_featured && <Badge className="absolute top-1 left-1/2 -translate-x-1/2">Featured</Badge>}
    </div>
  );
}

export function CountryCities({ country }: Readonly<{ country: CountryDetail }>) {
  const cities = [...country.cities].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = useSyncExternalStore(subscribeHoverCapability, getHoverCapability, getHoverCapabilityServer);

  // Both args must stay referentially stable — a fresh object/array literal on every render
  // makes embla tear down and re-initialize instead of running continuously.
  const emblaOptions = useMemo(() => ({ loop: true, align: "center" as const, containScroll: false as const }), []);
  const emblaPlugins = useMemo(
    () => (reducedMotion ? [] : [Autoplay({ delay: 3800, stopOnMouseEnter: true, stopOnInteraction: false })]),
    [reducedMotion],
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions, emblaPlugins);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    emblaApi.on("init", onSelect);
    emblaApi.on("pointerDown", () => setIsDragging(true));
    emblaApi.on("pointerUp", () => setIsDragging(false));
  }, [emblaApi, onSelect]);

  if (cities.length === 0) return null;

  return (
    <Reveal>
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 rounded-full bg-primary" />
          <h2 className="text-2xl font-bold">Cities &amp; Places</h2>
          <Badge variant="secondary">{cities.length} cities</Badge>
        </div>
      </div>

      <div className="relative">
        <div className={`overflow-hidden py-4 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`} ref={emblaRef}>
          <div className="flex items-center">
            {cities.map((city, i) => {
              const image = city.thumbnail_image_url ?? city.hero_image_url ?? getCityFallbackImage(city.id);
              return (
                <Link key={city.id} href={`/city/${country.slug}/${city.slug}`} className="min-w-0 shrink-0 grow-0 basis-auto">
                  <CityTile city={city} image={image} active={i === selectedIndex} />
                </Link>
              );
            })}
          </div>
        </div>

        {cities.length > 1 && canHover && (
          <>
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              aria-label="Previous city"
              className="group absolute inset-y-0 left-0 z-10 flex w-1/5 cursor-none items-center justify-start pl-2 sm:pl-4"
            >
              <span className="flex h-11 w-11 scale-75 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow-md transition-all group-hover:scale-100 group-hover:opacity-100">
                <ChevronLeft className="h-5 w-5" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              aria-label="Next city"
              className="group absolute inset-y-0 right-0 z-10 flex w-1/5 cursor-none items-center justify-end pr-2 sm:pr-4"
            >
              <span className="flex h-11 w-11 scale-75 items-center justify-center rounded-full bg-background text-foreground opacity-0 shadow-md transition-all group-hover:scale-100 group-hover:opacity-100">
                <ChevronRight className="h-5 w-5" />
              </span>
            </button>
          </>
        )}
      </div>
    </Reveal>
  );
}
