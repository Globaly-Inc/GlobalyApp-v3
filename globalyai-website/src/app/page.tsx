import { Hero } from "@/components/v6/hero";
import { ProductFilm } from "@/components/v6/film";
import { Learning } from "@/components/v6/learning";
import { Faq, Features, FinalCta, Institutions, ProblemSolution, Proof } from "@/components/v6/sections";
import { SiteShell } from "@/components/v6/shell";

/**
 * Variation 6 - variation 1, upgraded, in two modes.
 *
 * Variation 1 is the pastel-and-rounded direction and it is light only, flat,
 * and still. This keeps what worked - the friendliness, the rounding, the
 * brand navy, the headline - and changes three things.
 *
 * It has a dark mode. Light is variation 1's pale blue field. Dark is
 * daily.dev's palette, the same values variation 2 uses, because the brand
 * navy vanishes on near-black and the brighter blue has to carry it there.
 * The switch is in the nav, the choice is remembered, and the default is
 * whatever the visitor's system already asked for. An inline script applies
 * it before first paint so a dark-mode visitor never sees a white flash.
 *
 * It has one surface, one radius and one gradient, used everywhere. In dark
 * that surface is frosted glass, and it earns its keep because there is
 * something moving behind it: generated aurora footage, one clip per theme,
 * under the hero and under the close. In light it is variation 1's white
 * lifted card instead, because the pastel field is the thing that has to
 * read there and glass mutes it; the footage stays, held well back, as a
 * drift in the field rather than shapes in front of it.
 *
 * It waits to be touched. Variation 1 plays a conversation at you. This one
 * hands you three questions and answers whichever you pick, cites the pages
 * it answered from, and hands the last one to a person, which is the product
 * argument acted out rather than described.
 *
 * Photography is daylight and empty, the opposite of the night set the two
 * dark variations share.
 */
export default function Variation6() {
  return (
    <SiteShell>
      <Hero />
      <Proof />
      <ProblemSolution />
      <ProductFilm />
      <Features />
      <Institutions />
      <Learning />
      <Faq />
      <FinalCta />
    </SiteShell>
  );
}
