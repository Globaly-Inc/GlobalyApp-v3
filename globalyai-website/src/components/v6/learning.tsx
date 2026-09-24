"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "@/hooks/use-reveal";
import { Reveal } from "@/components/site/primitives";
import { LearningCore } from "./core";
import { GlassPanel, SectionHeading } from "./primitives";

/**
 * Student questions arriving at the thing that answers them: each one a chat
 * message, on a trail of dots that shrinks toward the brain it is headed for.
 *
 * The brain sits in the centre with three bubbles either side of it, which is
 * the shape asked for on 23 Sep 2026. An earlier pass had put the questions in
 * one column on the grounds that a symmetric hub has no direction; the
 * direction now comes from the motion instead. Every 2.6 seconds a new
 * question pops into one of the six bubbles, drawn from a pool of twelve, a
 * light runs down its trail into the brain, and the brain takes it in with a
 * pulse, a flare and a ripple. The status under the brain walks through
 * thinking, analyzing and improving across each arrival, so the word always
 * matches the beat on screen. Bubbles are refilled out of order, so it reads as
 * questions arriving rather than as a list cycling.
 *
 * Pointing at a bubble pauses the arrivals and lights that bubble and its trail.
 * Under reduced motion the first six questions are simply there, nothing
 * arrives, and the status holds on its first word.
 *
 * Geometry without measurement. Each bubble is a fixed width, pinned to one
 * side at a known inset, so its inner edge is a length the CSS can name; the
 * brain is a fixed size at the centre, so its edge is too. The trail dots are
 * then placed by calc() between the two, as fractions of the gap, which holds
 * at every width from lg up without a resize observer.
 *
 * Below lg there is no room either side, so the brain goes on top and the
 * bubbles stack under it without trails.
 */

/**
 * The questions are the ones an admissions team actually gets in the first
 * minute, and deliberately not all answerable from a program page: the last
 * is the sort that ends in a handoff.
 */
const QUESTIONS = [
  "Do I need work experience for the MBA?",
  "Is my three-year degree enough to apply?",
  "What are the fees for September 2026?",
  "Can I apply before my final results?",
  "Is there a scholarship for my country?",
  "When does the international deadline close?",
  "Which English tests do you accept?",
  "Can I switch programs after I enrol?",
  "Is on-campus housing guaranteed?",
  "Do you accept a GMAT waiver?",
  "Can I start in January instead?",
  "Can I speak to someone in admissions?",
] as const;

/** Six bubbles on screen; the other six questions arrive in their place. */
const ROWS = 6;

/** The order bubbles are refilled in, left and right alternating. */
const ARRIVAL_ORDER = [0, 4, 2, 3, 1, 5] as const;

/** How long each question has the brain to itself. */
const ARRIVAL_MS = 2600;

/** The status walks through these across one arrival, in step with the motion. */
const STATUS = ["Thinking", "Analyzing", "Improving"] as const;
/** When each status word takes over within an arrival: pop, landing, settle. */
const STATUS_AT_MS = [0, 1050, 1800] as const;

/** The bubble the nth arrival lands in, counting from one. */
const arrivalRow = (arrival: number): number => ARRIVAL_ORDER[(arrival - 1) % ROWS] ?? 0;

/**
 * Which question each bubble shows after a given number of arrivals. Bubble b
 * starts on question b; arrival k puts question (ROWS - 1 + k) in its bubble.
 * The six on screen are always six consecutive arrivals, so with a pool of
 * twelve no question is ever on screen twice.
 */
function rowsAfter(arrivals: number) {
  return Array.from({ length: ROWS }, (_, row) => {
    for (let k = arrivals; k > Math.max(0, arrivals - ROWS); k -= 1) {
      if (arrivalRow(k) === row) return (ROWS - 1 + k) % QUESTIONS.length;
    }
    return row;
  });
}

/**
 * Where each bubble sits. `y` is its centre as a percentage of the figure's
 * height; `inset` is how far it stands off its side, in rem. The middle pair
 * stand furthest out and the outer pairs step in, so the six curve round the
 * brain instead of standing in two straight columns.
 */
const SLOTS = [
  { side: "left", y: 15, inset: 2.5 },
  { side: "left", y: 50, inset: 0 },
  { side: "left", y: 85, inset: 2.5 },
  { side: "right", y: 15, inset: 2.5 },
  { side: "right", y: 50, inset: 0 },
  { side: "right", y: 85, inset: 2.5 },
] as const;

/** Bubble width, and the radius the trails stop short of, in rem. */
const BUBBLE_W = 14;
const BRAIN_STOP = 7.25;

/**
 * The trail: dots from the bubble to the brain, largest at the bubble. `at` is how far along the gap each one sits.
 */
const TRAIL = [
  { at: 0.14, size: 11 },
  { at: 0.4, size: 8 },
  { at: 0.64, size: 6 },
  { at: 0.86, size: 4 },
] as const;

/**
 * One dot's position. x runs from the bubble's inner edge to the brain's edge;
 * y runs from the bubble's centre toward the middle, stopping at a third of the
 * way so the trails meet the brain's side rather than all converging on one
 * point.
 */
function trailDot(slot: (typeof SLOTS)[number], at: number): CSSProperties {
  const from = `${slot.inset + BUBBLE_W}rem`;
  const gap = `(50% - ${slot.inset + BUBBLE_W + BRAIN_STOP}rem)`;
  const x = `calc(${from} + ${gap} * ${at})`;
  const y = slot.y + (50 - slot.y) * at * 0.66;
  return {
    top: `${y}%`,
    ...(slot.side === "left" ? { left: x } : { right: x }),
  };
}

export function Learning() {
  const [active, setActive] = useState<number | null>(null);
  const [arrivals, setArrivals] = useState(0);
  const [status, setStatus] = useState(0);
  const { ref, inView } = useInView<HTMLDivElement>("-15% 0px");
  const reduced = usePrefersReducedMotion();

  // Arrivals run only while the figure is on screen and nobody is pointing at it.
  const thinking = inView && !reduced && active === null;
  useEffect(() => {
    if (!thinking) return;
    const id = window.setInterval(() => setArrivals((n) => n + 1), ARRIVAL_MS);
    return () => window.clearInterval(id);
  }, [thinking]);

  // The status words, restarted on every arrival so they stay in step with it.
  useEffect(() => {
    if (arrivals === 0) return;
    const timers = STATUS_AT_MS.map((at, index) => window.setTimeout(() => setStatus(index), at));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [arrivals]);

  const rows = rowsAfter(arrivals);
  const arriving = arrivals > 0 ? arrivalRow(arrivals) : null;
  const lit = active ?? arriving;

  return (
    <section id="learning" className="px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <SectionHeading
            align="center"
            wide
            title={
              <>
                And it learns from every conversation,{" "}
                <span className="text-[var(--muted-foreground)]">on its own.</span>
              </>
            }
            lead="Every exchange sharpens the next. It picks up what students keep asking and where they get stuck, and improves without being retrained."
          />
        </Reveal>

        <Reveal delay={90}>
          <GlassPanel spotlight={false} className="mt-14 p-6 sm:p-8 lg:px-10 lg:py-14">
            {/* One observer for both layouts. The desktop figure is display:none
                below lg, where it can never intersect, so observing it there left
                the stacked version parked on its first six questions. */}
            <div ref={ref}>
              {/* Desktop: the brain in the centre, three bubbles either side. */}
              <div
                className="relative hidden h-[30rem] lg:block"
                onMouseLeave={() => setActive(null)}
              >
                {SLOTS.map((slot, index) =>
                  TRAIL.map((dot, step) => (
                    <span
                      key={`${index}-${step}`}
                      aria-hidden="true"
                      className={cn(
                        "v6-row v6-trail-dot absolute -translate-y-1/2 rounded-full",
                        slot.side === "left" ? "-translate-x-1/2" : "translate-x-1/2",
                        inView && "v6-row-in",
                        lit === index && "v6-trail-lit",
                      )}
                      style={{
                        ...trailDot(slot, dot.at),
                        width: dot.size,
                        height: dot.size,
                        animationDelay: `${0.3 + index * 0.1 + step * 0.06}s`,
                      }}
                    />
                  )),
                )}

                {/* The light carrying the newest question in: the same dots
                    again, flashing bubble to brain in turn. Keyed on the arrival
                    so each one is fresh and replays. */}
                {arriving !== null &&
                  TRAIL.map((dot, step) => {
                    const slot = SLOTS[arriving] ?? SLOTS[0];
                    return (
                      <span
                        key={`spark-${arrivals}-${step}`}
                        aria-hidden="true"
                        className={cn(
                          "v6-trail-spark absolute -translate-y-1/2 rounded-full",
                          slot.side === "left" ? "-translate-x-1/2" : "translate-x-1/2",
                        )}
                        style={{
                          ...trailDot(slot, dot.at),
                          width: dot.size,
                          height: dot.size,
                          animationDelay: `${0.25 + step * 0.2}s`,
                        }}
                      />
                    );
                  })}

                {/* The label hangs below the brain rather than stacking under
                    it, so the brain itself is the thing centred on the trails. */}
                <div className="absolute left-1/2 top-1/2 w-[12rem] -translate-x-1/2 -translate-y-1/2">
                  <LearningCore lit={active !== null} pulse={arrivals} />
                  <div className="absolute inset-x-0 top-full flex justify-center">
                    <StatusLabel word={STATUS[status] ?? STATUS[0]} paused={!thinking} />
                  </div>
                </div>

                <ul>
                  {SLOTS.map((slot, index) => (
                    <li
                      key={index}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        "v6-row absolute -translate-y-1/2",
                        inView && "v6-row-in",
                      )}
                      style={{
                        top: `${slot.y}%`,
                        width: `${BUBBLE_W}rem`,
                        [slot.side]: `${slot.inset}rem`,
                        animationDelay: `${0.2 + index * 0.1}s`,
                      }}
                    >
                      <ChatBubble
                        question={rows[index] ?? index}
                        side={slot.side}
                        lit={lit === index}
                        popping={arriving === index}
                      />
                    </li>
                  ))}
                </ul>
              </div>

              {/* Below lg: the brain, then the same six bubbles stacked. */}
              <div className="lg:hidden">
                <div className="flex flex-col items-center">
                  <LearningCore className="max-w-[9rem]" pulse={arrivals} />
                  <StatusLabel word={STATUS[status] ?? STATUS[0]} paused={!thinking} />
                </div>

                <ul className="mx-auto mt-10 grid max-w-md gap-7 px-3">
                  {rows.map((question, index) => (
                    <li key={index}>
                      <ChatBubble question={question} lit={arriving === index} popping={arriving === index} />
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassPanel>
        </Reveal>

        {/* Three claims under the picture, on the CEO's call (24 Sep 2026).
            The picture shows it getting better on its own, which raises the
            three questions an institution asks next: where does the knowledge
            live, who is in charge of it, and can it make things up.

            "Never hallucinates" is not written as an absolute. It answers only
            from approved content and says so when it has nothing, which is the
            mechanism; an unqualified "never" is a promise the first odd
            transcript breaks. */}
        <Reveal delay={140}>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {ASSURANCES.map(({ title, body }) => (
              <GlassPanel key={title} className="h-full p-7 lg:p-8">
                <h3 className="text-[17px] leading-snug">{title}</h3>
                <p className="mt-3 text-[14.5px] leading-[1.65] text-[var(--body)]">{body}</p>
              </GlassPanel>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const ASSURANCES = [
  {
    title: "An information powerhouse",
    body: "Everything your institution has published, held in one place and answerable in a sentence. The more you give it, the more it can guide with.",
  },
  {
    title: "No knowledge base to maintain",
    body: "Your pages stay the single source. Nobody retypes the site into a second system, and nothing goes stale in two places at once.",
  },
];

/**
 * A question as a chat message. The tail sits on the side facing the brain, at
 * the height the trail leaves from, so the bubble reads as sent toward it.
 * The tail is a rotated square carrying the two borders that end up outside,
 * on the same fill as the bubble, so the two join without a seam. Stacked
 * below lg there is no brain beside it, so there is no tail either.
 */
function ChatBubble({
  question,
  side,
  lit,
  popping,
}: Readonly<{ question: number; side?: "left" | "right"; lit: boolean; popping: boolean }>) {
  return (
    <div
      className={cn(
        "relative rounded-[20px] border bg-[var(--surface)] transition-[border-color,box-shadow] duration-500",
        side === "left" && "rounded-br-md",
        side === "right" && "rounded-bl-md",
        lit
          ? "border-[var(--primary-bright)] shadow-[0_0_24px_-4px_rgb(56_189_248/0.45)]"
          : "border-[var(--border-strong)]",
      )}
    >
      {side && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 bg-[var(--surface)] transition-colors duration-500",
            side === "left" ? "-right-[6.5px] border-r border-t" : "-left-[6.5px] border-b border-l",
            lit ? "border-[var(--primary-bright)]" : "border-[var(--border-strong)]",
          )}
        />
      )}
      {/* Keyed on the question, so a new one is a new element and pops in
          rather than the text swapping in place. */}
      <p
        key={question}
        className={cn(
          "relative px-5 py-3.5 text-[14px] leading-snug transition-colors duration-500",
          lit ? "text-[var(--foreground)]" : "text-[var(--body)]",
          popping && "v6-pop",
        )}
      >
        {QUESTIONS[question]}
      </p>
    </div>
  );
}

/**
 * The status under the brain. The word changes with the beat, and the three
 * dots pulse while questions are arriving and hold still when paused, so it
 * never claims something the picture is not doing.
 */
function StatusLabel({ word, paused }: Readonly<{ word: string; paused: boolean }>) {
  return (
    <p
      aria-hidden="true"
      className="mt-5 inline-flex min-w-[8.5rem] items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--muted-foreground)]"
    >
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className={cn("h-1 w-1 rounded-full bg-[var(--primary-bright)]", !paused && "v6-think-dot")}
            style={{ animationDelay: `${dot * 0.18}s` }}
          />
        ))}
      </span>
      <span key={word} className={cn(!paused && "v6-pop")}>
        {word}…
      </span>
    </p>
  );
}
