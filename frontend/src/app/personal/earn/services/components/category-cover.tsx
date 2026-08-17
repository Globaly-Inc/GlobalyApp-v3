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
  airport_pickup: "from-sky-100 to-indigo-200 dark:from-sky-950 dark:to-indigo-900",
  city_orientation: "from-amber-100 to-rose-200 dark:from-amber-950 dark:to-rose-900",
  rental_support: "from-emerald-100 to-teal-200 dark:from-emerald-950 dark:to-teal-900",
  employment_support: "from-slate-100 to-blue-200 dark:from-slate-900 dark:to-blue-900",
  assignment_help: "from-violet-100 to-fuchsia-200 dark:from-violet-950 dark:to-fuchsia-900",
  private_tutoring: "from-orange-100 to-amber-200 dark:from-orange-950 dark:to-amber-900",
  other: "from-stone-100 to-neutral-200 dark:from-stone-900 dark:to-neutral-800",
};

/** Anything an admin adds later still gets a stable wash rather than falling back to grey. */
const FALLBACKS = [
  "from-cyan-100 to-blue-200 dark:from-cyan-950 dark:to-blue-900",
  "from-lime-100 to-emerald-200 dark:from-lime-950 dark:to-emerald-900",
  "from-pink-100 to-purple-200 dark:from-pink-950 dark:to-purple-900",
  "from-yellow-100 to-orange-200 dark:from-yellow-950 dark:to-orange-900",
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
