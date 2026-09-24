"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-reveal";
import { useTimeline } from "@/hooks/use-timeline";
import { FILM_BEATS, FilmStage } from "@/components/demo/film-stage";
import { Reveal } from "@/components/site/primitives";
import { GlassPanel, SectionHeading } from "./primitives";

const DURATIONS = FILM_BEATS.map((beat) => beat.hold);

/**
 * Variation 1's product film, brought onto variation 6 and put in this
 * variation's surface.
 *
 * <FilmStage /> and the beats are shared with variation 1 rather than copied:
 * the conversation is the same conversation, and a second copy of it would
 * drift. Only the frame around it is new. Variation 1 sets the film on a white
 * card on a white section; here it sits in the one glass panel this variation
 * uses everywhere, so it themes with the rest of the page.
 *
 * Two things had to change for dark mode. The stage draws its chips and
 * bubbles on --card, which the .v6 scope never defined, so it was inheriting
 * the global #ffffff and would have stayed white on a near-black page; --card
 * is now set per mode alongside the other v6 surfaces. And the panel takes
 * spotlight={false}, unlike every other panel on the page, because a glow that
 * follows the cursor sitting behind a live transport the visitor is aiming at
 * reads as a rendering fault rather than as polish.
 *
 * No eyebrow, unlike variation 1's "Watch it work": the page already spends
 * its three on Proof, the problem and solution pair, and the FAQ. The heading
 * says what the section is without one.
 */
export function ProductFilm() {
  const { ref, inView } = useInView<HTMLDivElement>("-12% 0px");
  const { step, playing, toggle, restart, setStep, reducedMotion } = useTimeline({
    durations: DURATIONS,
    active: inView,
    restDelay: 700,
  });

  const total = FILM_BEATS.length;
  const caption = FILM_BEATS[step]?.caption ?? "";

  return (
    <section className="px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <SectionHeading
            align="center"
            wide
            title="See GlobalyAI in a real conversation"
            lead="How a prospective student goes from a simple question to a guided next step, without ever leaving your website."
          />
        </Reveal>

        <Reveal delay={90}>
          {/* max-w-6xl rather than 4xl: the stage's height is fixed by
              FilmStage, shared with v1 and v2, so width is what sets its
              shape. At 6xl it reads as a 16:10 desktop screen, not a square. */}
          <div ref={ref} className="mx-auto mt-12 max-w-6xl">
            <GlassPanel spotlight={false} className="p-3 sm:p-4">
              <FilmStage beat={step} />

              {/* Transport. Kept below the stage so it never covers the UI it
                  is describing. */}
              <div className="mt-3 px-1 pb-1 sm:mt-4">
                <p
                  className="min-h-[2.75rem] text-pretty text-center text-[14px] font-semibold leading-snug text-[var(--foreground)] sm:text-[15px]"
                  aria-live="polite"
                >
                  {caption}
                </p>

                <div className="mt-2.5 flex items-center gap-3">
                  {!reducedMotion && (
                    <button
                      type="button"
                      onClick={toggle}
                      aria-label={playing ? "Pause the demo" : "Play the demo"}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white transition-transform hover:scale-105"
                    >
                      {playing ? (
                        <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}

                  {/* Chapter scrubber: one segment per beat, each focusable. */}
                  <ol className="flex flex-1 items-center gap-1">
                    {FILM_BEATS.map((beatItem, index) => (
                      <li key={beatItem.caption} className="flex-1">
                        <button
                          type="button"
                          onClick={() => setStep(index)}
                          aria-label={`Chapter ${index + 1} of ${total}: ${beatItem.caption}`}
                          aria-current={index === step || undefined}
                          className="group relative block h-6 w-full"
                        >
                          <span
                            className={cn(
                              "absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-colors",
                              index < step && "bg-[var(--primary)]/45",
                              index === step && "bg-[var(--primary)]",
                              index > step && "bg-[var(--border)] group-hover:bg-[var(--primary)]/30",
                            )}
                          />
                        </button>
                      </li>
                    ))}
                  </ol>

                  <button
                    type="button"
                    onClick={restart}
                    aria-label="Restart the demo"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary-bright)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </GlassPanel>

            <p className="mt-4 text-center text-[12.5px] text-[var(--muted-foreground)]">
              An illustration of the product experience. Programs, wording and branding are
              configured per institution.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
