import Image from "next/image";
import { DynamicIcon } from "@/components/dynamic-icon";
import { cn } from "@/lib/utils";

/**
 * A listing's image, or a per-category stand-in when it has none.
 *
 * Cover upload needs a GCS bucket (§6.4) and most listings will never have one anyway, so "no image" is the
 * normal case rather than the exception — a grey box with a generic icon made every such listing look broken.
 * This draws something deliberate instead: a fixed two-tone wash per category plus that category's own icon,
 * so *Airport Pickup* always looks like Airport Pickup and two listings in a row never look identical by
 * accident.
 *
 * No network, no asset pipeline, no generated files: CSS gradients and an icon already in the bundle. If real
 * photography arrives later, drop `<slug>.jpg` into `public/services/` and prefer it in `wash()` — the call
 * sites do not change.
 */

/** Explicit per-category washes. Seven categories is few enough to pick pleasant pairs by hand. */
const WASHES: Record<string, string> = {
  airport_pickup: "from-info/15 to-chart-1/25",
  city_orientation: "from-warning/15 to-chart-5/25",
  rental_support: "from-success/15 to-chart-2/25",
  employment_support: "from-muted to-accent",
  assignment_help: "from-chart-4/15 to-chart-6/25",
  private_tutoring: "from-chart-3/15 to-chart-7/25",
  // Mirror of employment_support so the two neutral washes still differ.
  other: "from-accent to-muted",
};

/** Anything an admin adds later still gets a stable wash rather than falling back to grey. */
const FALLBACKS = [
  "from-chart-1/15 to-chart-4/25",
  "from-chart-2/15 to-info/25",
  "from-chart-5/15 to-chart-3/25",
  "from-chart-6/15 to-success/25",
];

function wash(slug: string): string {
  if (WASHES[slug]) return WASHES[slug];
  // Deterministic so a category keeps the same look between renders and between pages.
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return FALLBACKS[hash % FALLBACKS.length]!;
}

export function CategoryCover({
  coverUrl,
  categorySlug,
  categoryName,
  categoryIcon,
  title,
  className,
  iconClassName,
  showLabel = false,
  sizes,
}: Readonly<{
  coverUrl: string | null;
  categorySlug: string;
  categoryName: string;
  categoryIcon?: string | null;
  title?: string;
  className?: string;
  iconClassName?: string;
  /** The big surfaces name the category; a 48px thumbnail has no room for it. */
  showLabel?: boolean;
  sizes?: string;
}>) {
  if (coverUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        {/* unoptimized: the URL is a short-lived signed GCS link, so Next's optimizer would cache a 404. */}
        <Image src={coverUrl} alt={title ?? ""} fill className="object-cover" sizes={sizes ?? "100vw"} unoptimized />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br",
        wash(categorySlug),
        className,
      )}
      // Decorative: the category is already stated in text next to every one of these.
      aria-hidden
    >
      <DynamicIcon
        name={categoryIcon}
        fallback="Package"
        className={cn("text-foreground/25", iconClassName ?? "size-10")}
      />
      {showLabel && (
        <span className="px-4 text-center text-sm font-medium text-foreground/45">{categoryName}</span>
      )}
    </div>
  );
}
