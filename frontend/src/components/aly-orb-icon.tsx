import { ALY_ORB } from "@/lib/public-assets";
import { cn } from "@/lib/utils";

/**
 * Ask Aly's animated orb, shaped to stand in for a `lucide` icon: it takes the same `className` the nav
 * sizes its icons with (`h-5 w-5`, `h-4 w-4`), so `PortalNavGroup.icon` accepts it unchanged.
 *
 * The 512-unit source is transparent apart from a 304-unit sphere centred at y 240 — so the solid mark covers
 * only 59% of the frame, and its centre is 16 units (3.1%) above the frame's. Untouched it therefore renders
 * both noticeably smaller than the icons beside it and visibly high in anything that centres the frame, hence
 * the `scale`/`translate-y` pair; 1.75 takes the sphere a shade past the icon box, which is what it needs to
 * carry the same weight as the `lucide` glyphs above and below it, and leaves the halo — which reaches 84% of
 * the frame and is part of the artwork, not padding — feathering past the box. Both are transforms, so the
 * box — and the rail tile's icon-over-label layout — is unaffected. `translate-y` is a percentage of the
 * element, which `scale` multiplies exactly as it multiplies the offset being cancelled, so callers can
 * override `scale` without re-centring anything.
 */
// ponytail: a plain `<img>`, not next/image — the optimizer has nothing to do with an SVG, and the animation
// lives in a `<style>` inside the file, which only survives when the browser loads the SVG itself.
export function AlyOrbIcon({ className }: Readonly<{ className?: string }>) {
  // eslint-disable-next-line @next/next/no-img-element -- animated SVG, next/image would only add a hop
  return <img src={ALY_ORB} alt="" aria-hidden className={cn("shrink-0 translate-y-[3.1%] scale-[1.75]", className)} />;
}
