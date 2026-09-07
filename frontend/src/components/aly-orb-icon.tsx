import { ALY_ORB } from "@/lib/public-assets";
import { cn } from "@/lib/utils";

/**
 * Ask Aly's animated orb, shaped to stand in for a `lucide` icon: it takes the same `className` the nav
 * sizes its icons with (`h-5 w-5`, `h-4 w-4`), so `PortalNavGroup.icon` accepts it unchanged.
 *
 * The 240×240 source is transparent apart from a 142px sphere sitting at y 41–183 — so it covers only 59%
 * of the frame, and its centre is 8px (3.3%) above the frame's. Untouched it therefore renders both
 * two-thirds the size of the icons beside it and visibly high in anything that centres the frame, hence the
 * `scale`/`translate-y` pair. Both are transforms, so the box — and the rail tile's icon-over-label
 * layout — is unaffected. `translate-y` is a percentage of the element, which `scale` multiplies exactly as
 * it multiplies the offset being cancelled, so callers can override `scale` without re-centring anything.
 */
// ponytail: a plain `<img>`, not next/image — the optimizer re-encodes a GIF into a still frame, and the
// whole point of this asset is that it moves.
export function AlyOrbIcon({ className }: Readonly<{ className?: string }>) {
  // eslint-disable-next-line @next/next/no-img-element -- animated remote GIF, next/image would freeze it
  return <img src={ALY_ORB} alt="" aria-hidden className={cn("shrink-0 translate-y-[3.3%] scale-[2]", className)} />;
}
