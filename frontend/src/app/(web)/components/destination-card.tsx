import Link from "next/link";
import type { Destination } from "../data/destinations";

/**
 * One tile on the home page's destination shelf: the country's photograph with its flag and name over a
 * bottom gradient. Falls back to the flag on a flat panel for a country with no photo on file — which is
 * what every tile looked like while `/countries/featured` still withheld `hero_image_url`.
 */
export function DestinationCard({ destination }: Readonly<{ destination: Destination }>) {
  return (
    <Link
      href={`/country/${destination.slug}`}
      className="group relative overflow-hidden rounded-2xl block"
      style={{ aspectRatio: "4/3" }}
    >
      {destination.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={destination.heroImageUrl}
          alt={destination.name}
          className="absolute inset-0 w-full h-full object-cover md:transition-transform md:duration-700 md:group-hover:scale-110"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-muted flex items-center justify-center text-5xl md:transition-transform md:duration-700 md:group-hover:scale-110">
          {destination.flagEmoji}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10 transition-opacity duration-300 group-hover:opacity-90" />
      <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
        {/* md:leading-7 for the same reason as the hero headline: v3's `md:text-lg` used to win over
            `leading-tight`, v4's does not. See page.tsx. */}
        <h3 className="font-bold text-white text-base md:text-lg leading-tight md:leading-7">
          <span className="mr-1">{destination.flagEmoji}</span>
          {destination.name}
        </h3>
      </div>
    </Link>
  );
}
