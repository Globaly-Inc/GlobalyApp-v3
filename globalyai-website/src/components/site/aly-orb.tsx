import { cn } from "@/lib/utils";

/**
 * Ask Aly's orb — the azure variant of the Globaly brand mark, and the
 * assistant's own identity across GlobalyApp. Ported from
 * `GlobalyApp-v3/frontend/src/components/aly-orb-icon.tsx`.
 *
 * The 512-unit source is transparent apart from a 304-unit sphere centered at
 * y 240, so the solid mark covers only 59% of the frame and sits 3.1% above
 * its center. The scale/translate pair corrects both, letting the orb carry
 * the same visual weight as the text beside it; the halo feathers past the box
 * on purpose, since it is artwork rather than padding.
 *
 * A plain <img>, not next/image: the optimizer has nothing to do with an SVG,
 * and the animation lives in a <style> inside the file, which only runs when
 * the browser loads the SVG itself.
 */
export function AlyOrb({ className }: Readonly<{ className?: string }>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- animated SVG; next/image would only add a hop
    <img
      src="/globaly-orb-azure.svg"
      alt=""
      aria-hidden
      className={cn("shrink-0 translate-y-[3.1%] scale-[1.75]", className)}
    />
  );
}
