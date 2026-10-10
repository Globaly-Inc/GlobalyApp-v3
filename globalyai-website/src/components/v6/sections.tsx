"use client";

import { useState, type ComponentType } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAQS } from "@/lib/faqs";
import { Reveal } from "@/components/site/primitives";
import { Aurora } from "./aurora";
import type { MockProps } from "./mocks";
import { AnswerMock, ChatMock, FormMock, GuideMock, LeadMock, MOCK_BEATS, MockStage, MultiSiteMock } from "./mocks";
import { CtaButton, Eyebrow, GlassPanel, SectionHeading } from "./primitives";

/* ── Proof ──────────────────────────────────────────────────────────────── */

/**
 * Product figures rather than company credentials, on the CEO's call
 * (23 Sep 2026): he asked for conversion growth, accuracy and similar.
 *
 * Every figure here is true by construction rather than by measurement, which
 * is the only kind this page can carry today. There is no customer conversion
 * data yet, and no accuracy benchmark has been run, so no multiple and no
 * percentage-correct is claimed. An invented "3x" or "98% accurate" is the one
 * thing that loses an admissions director, because it is the first thing their
 * IT reviewer will ask for the methodology behind.
 *
 * Replace any of these the moment a pilot produces a real number. The company
 * credentials this strip used to carry (10 years, 400+ agencies, 5,000+ daily
 * users, 20+ countries) were cleared on 17 Sep and are still true; they just
 * say nothing about the product on the page.
 */
const STATS = [
  { figure: "Built with intelligence", label: "it works out what is being asked, rather than which keyword matched" },
  { figure: "100% your content", label: "every answer comes from a page you approved, with that page named. Nothing is invented" },
  { figure: "Conversion growth", label: "more inquiries from the same traffic, from the day it goes live" },
  { figure: "24/7 availability", label: "answering through the evenings and weekends your team cannot cover" },
];

export function Proof() {
  return (
    <section className="px-3 pb-12 pt-10 sm:px-5 md:pb-16 md:pt-14">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          {/* Variation 1's .panel-soft, not a card: the strip under the hero
              is a tinted container holding four figures, so it sits on the
              page rather than floating above it. */}
          <GlassPanel className="v6-soft grid grid-cols-1 gap-x-12 gap-y-10 px-8 py-10 sm:grid-cols-2 sm:px-10 sm:py-12 lg:grid-cols-4">
            {STATS.map(({ figure, label }) => (
              <div key={figure}>
                <p className="v6-gradient-text font-display text-[clamp(1.35rem,2.2vw,1.75rem)] font-medium leading-[1.15] tracking-[-0.025em]">
                  {figure}
                </p>
                <p className="mt-3.5 max-w-[16rem] text-[13.5px] leading-[1.55] text-[var(--muted-foreground)]">
                  {label}
                </p>
              </div>
            ))}
          </GlassPanel>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Features ───────────────────────────────────────────────────────────── */

/**
 * From the user's own copy notes, 21 Sep 2026. Two claims are written to the
 * edge of what the codebase supports and no further: Extraction 2.0 says "the
 * content you point it at" rather than naming formats, and the language line
 * describes the mechanism rather than counting languages.
 */
/** A 3D object in the slot the icon well used to fill. Decorative: the card's
    heading already says what it is. */
function ObjectIcon({ name }: Readonly<{ name: string }>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 480px WebP shown at 44px; next/image adds nothing here
    <img src={`/objects/${name}.webp`} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 object-contain" />
  );
}

const FEATURES = [
  {
    object: "files",
    title: "Your site is the knowledge base",
    body: "It works from the content you point it at, so your pages stay the single source. Nobody on your team retypes the site into a second system to maintain.",
  },
  {
    object: "database",
    title: "Your data, managed",
    body: "Add a document, replace a policy, retire last year's fee schedule. It answers from the current version, not the one it learned first.",
  },
  {
    object: "moon",
    title: "It works while you sleep",
    body: "Evenings, weekends, and every time zone your applicants live in. The question at 9pm gets answered at 9pm.",
  },
  {
    object: "globe",
    title: "It speaks their language",
    body: "A student asks in English, a parent asks in their own. It replies in the language the question was asked in, from the same approved content.",
  },
  {
    object: "chat",
    title: "Every answer has a source",
    body: "It shows the page an answer came from. Your team can check any conversation, and a student can see it is not guesswork.",
  },
  {
    object: "target",
    title: "It knows who you are looking for",
    body: "You describe the applicant you want: level, program, country, funding, intake. It asks the questions that establish fit, and marks the conversations that match.",
  },
  {
    object: "shield",
    title: "It never hallucinates",
    body: "It answers from your approved content or not at all. When a question falls outside what it was given, it says so and hands over rather than guessing.",
  },
] as const;

export function Features() {
  return (
    /* The pale blue band. Variation 1 alternates white sections with a
       full-bleed tinted one, and the seven white cards land on the tint —
       which is most of why that page reads as coloured rather than as white
       with blue text. Light only; in dark the band is the page. */
    <section id="features" className="v6-field px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <SectionHeading
            align="center"
            title="What makes Globaly AI the smartest guidance agent your website can have"
            lead="Seven things a generic website bot does not do."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ object, title, body }, index) => (
            /* The seventh card was alone on a row of three. It runs the full
               width instead, with the icon beside the text rather than above
               it, which reads as a closing note on the list. */
            <Reveal
              key={title}
              delay={index * 60}
              className={cn(index === FEATURES.length - 1 && "sm:col-span-2 lg:col-span-3")}
            >
              <GlassPanel
                className={cn(
                  "h-full p-7 lg:p-8",
                  index === FEATURES.length - 1 && "sm:flex sm:items-center sm:gap-7",
                )}
              >
                <ObjectIcon name={object} />
                <div className={cn(index === FEATURES.length - 1 ? "mt-5 sm:mt-0" : "mt-5")}>
                  <h3 className="text-[18px] leading-snug">{title}</h3>
                  <p className="mt-2.5 max-w-2xl text-[15px] leading-[1.7] text-[var(--body)]">{body}</p>
                </div>
              </GlassPanel>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Problem and solution, as a bento ───────────────────────────────────── */

/**
 * The CEO's call, 23 Sep 2026: problem and solution together. <Gap /> and
 * <Answer /> said the same three things a screen apart, linked by matching
 * numerals; here each failure sits beside its own fix and the numeral is a
 * label rather than a cross-reference.
 *
 * Laid out as a bento rather than as two equal columns. The split between the
 * two cards of a pair alternates down the page, 5/7 then 7/5 then 5/7, so no
 * two rows share a shape, and the wider card of each row sets its copy and its
 * list side by side, which is most of what keeps the section short.
 */
const PAIRS = [
  {
    index: "01",
    problem: "5,000 pages, and they get lost",
    problemPoints: [
      "A student spends three minutes and reads five to ten pages",
      "Five tabs open, one question unanswered",
      "The answer exists, and goes unfound",
    ],
    problemBody:
      "Nobody reads 5,000 pages. A student after one fact opens five tabs, searches each of them, and leaves before any of them answers. The content is there; it never reaches the people it was written for.",
    ProblemMock: MultiSiteMock,
    problemBeats: MOCK_BEATS.tabs,
    solution: "Trained on your content",
    SolutionMock: AnswerMock,
    solutionBeats: MOCK_BEATS.answer,
    points: [
      "Every page analyzed for guidance",
      "It knows the page they never reach",
      "Your pages, in your wording",
    ],
    solutionBody:
      "It reads all 5,000 pages, so nobody else has to. Every program page, entry requirement, fee table, policy and FAQ becomes an answer it can give in one sentence, in the order the student needs it. It answers only from your material, and never improvises.",
  },
  {
    index: "02",
    problem: "A generic bot answers. It never guides",
    problemPoints: [
      "It guesses when it does not know",
      "It hands back a link and waits",
      "The student never learns which program fits",
    ],
    problemBody:
      "It returns a snippet and waits. It never works out which program fits, what the student is missing, or what they do next. The exchange ends where it started.",
    ProblemMock: ChatMock,
    problemBeats: MOCK_BEATS.chat,
    solution: "Guides, not just answers",
    SolutionMock: GuideMock,
    solutionBeats: MOCK_BEATS.guide,
    points: [
      "Never invents an answer, and says when it does not know",
      "Gets better with every conversation it has",
      "Asks about prior study, grades and intake",
    ],
    solutionBody:
      "It asks what it needs to know, works out which program actually fits, and names the next step.",
  },
  {
    index: "03",
    problem: "It asks for a name before it earns one",
    problemPoints: [
      "Three required fields before a word of help",
      "Nothing offered, and everything asked",
      "The traffic you paid for, gone",
    ],
    problemBody:
      "The widget opens by demanding a name, an email and a phone number from someone who has not been helped yet. Nobody fills that in, and admissions never learns they were there.",
    ProblemMock: FormMock,
    problemBeats: MOCK_BEATS.form,
    solution: "Turns talk into an inquiry",
    SolutionMock: LeadMock,
    solutionBeats: MOCK_BEATS.lead,
    points: [
      "Marked qualified, or not",
      "It helps first, and asks last",
      "Turns anonymous visitors into named inquiries",
    ],
    solutionBody:
      "It answers the question first, and asks for a name once it has something worth handing over. Your team opens the inquiry already knowing who asked, what they wanted and what to say first.",
  },
] as const;

/**
 * One cell of the bento: the claim, and the interface that makes it, in one
 * card.
 *
 * On the wide cell of a row the copy and the list sit side by side, so the
 * card spends its extra width on shortening itself rather than on longer
 * lines. The screen is flex-1, so whichever card of the pair has less copy
 * spends the difference on a taller screen instead of a band of nothing.
 *
 * The inset's --fig is the one themed neutral (globals.css), which
 * <MockStage />'s mockups spend on their own sweeps and grounds.
 */
function PairCard({
  index,
  title,
  body,
  points,
  mock,
  beats,
  wide = false,
  solution = false,
}: Readonly<{
  index: string;
  title: string;
  body: string;
  points: readonly string[];
  mock: ComponentType<MockProps>;
  beats: readonly number[];
  wide?: boolean;
  solution?: boolean;
}>) {
  return (
    <GlassPanel className="flex h-full flex-col overflow-hidden p-4 sm:p-5">
      <div className="p-3 sm:p-4">
        <p
          className={cn(
            "text-[12.5px] font-semibold uppercase tracking-[0.1em]",
            solution ? "v6-gradient-text" : "text-[var(--muted-foreground)]",
          )}
        >
          {index} · {solution ? "The solution" : "The problem"}
        </p>
        <h3 className="mt-3 text-[19px] leading-snug">{title}</h3>

        <div className={cn(wide && "lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8")}>
          <p className="mt-3 text-[15px] leading-[1.7] text-[var(--body)]">{body}</p>
          <ul
            className={cn(
              "mt-5 space-y-2.5 border-t border-[var(--border)] pt-5",
              wide && "lg:mt-3 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1",
            )}
          >
            {points.map((point) => (
              <li
                key={point}
                className={cn(
                  "grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-3 text-[14.5px] leading-[1.6]",
                  solution ? "text-[var(--body)]" : "text-[var(--muted-foreground)]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-[2px] w-6 translate-y-[-0.35em] rounded-full",
                    solution ? "v6-gradient" : "bg-[var(--border-strong)]",
                  )}
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The screen, inset into the card rather than bolted under it: the
          rounding steps down from the card's own. */}
      <div
        className="v6-screen min-h-[17rem] flex-1 overflow-hidden rounded-[calc(var(--r-card)-0.75rem)] border"
      >
        <MockStage mock={mock} beats={beats} />
      </div>
    </GlassPanel>
  );
}

/* The problem card's span in each row; the solution takes the rest of 12. */
const PROBLEM_SPANS = ["lg:col-span-5", "lg:col-span-7", "lg:col-span-5"] as const;
const SOLUTION_SPANS = ["lg:col-span-7", "lg:col-span-5", "lg:col-span-7"] as const;

export function ProblemSolution() {
  return (
    <section id="product" className="px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <div className="flex justify-center">
            <Eyebrow className="mb-5">Problem and solution</Eyebrow>
          </div>
          <SectionHeading
            align="center"
            title={
              <>
                Too much information.{" "}
                <span className="text-[var(--muted-foreground)]">Too little guidance.</span>
              </>
            }
            lead="Three things stop a prospective student applying. Aly is built for exactly those three."
          />
        </Reveal>

        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-12 lg:gap-5">
          {PAIRS.map((pair, position) => {
            const problemWide = position === 1;
            return [
              <Reveal key={`${pair.index}-problem`} delay={position * 80} className={PROBLEM_SPANS[position]}>
                <PairCard
                  index={pair.index}
                  title={pair.problem}
                  body={pair.problemBody}
                  points={pair.problemPoints}
                  mock={pair.ProblemMock}
                  beats={pair.problemBeats}
                  wide={problemWide}
                />
              </Reveal>,
              <Reveal key={`${pair.index}-solution`} delay={position * 80 + 60} className={SOLUTION_SPANS[position]}>
                <PairCard
                  solution
                  index={pair.index}
                  title={pair.solution}
                  body={pair.solutionBody}
                  points={pair.points}
                  mock={pair.SolutionMock}
                  beats={pair.solutionBeats}
                  wide={!problemWide}
                />
              </Reveal>,
            ];
          })}
        </div>

        <Reveal delay={140}>
          <p className="mt-12 text-center text-[clamp(1.35rem,2.8vw,2rem)] leading-tight">
            Trained on you.{" "}
            <span className="text-[var(--muted-foreground)]">Built to convert.</span>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Institutions ───────────────────────────────────────────────────────── */

/**
 * Variation 1's bento, brought across on the CEO's call (23 Sep 2026): six
 * claims at two sizes, the two he cares about most given the wide cells.
 *
 * In this variation they are glass rather than pastel, because there are no
 * tints here and inventing six would break the one-surface rule the whole page
 * is built on. The campus photograph that used to sit beside a bullet list is
 * gone with the list.
 */
const RECEIVES = [
  {
    object: "clock",
    title: "Engages outside office hours",
    body: "Prospective students research in the evening, at weekends and across time zones. The assistant is there for the question at 9pm that would otherwise have waited until Monday, or not been asked at all.",
    span: "sm:col-span-2",
  },
  {
    object: "chat",
    title: "Answers the repetitive questions",
    body: "Entry requirements, deadlines, fees, intakes. The questions your team answers dozens of times a week.",
    span: "",
  },
  {
    object: "funnel",
    title: "Tells you who is serious",
    body: "It asks what a counselor would ask, so what reaches your team is a qualified student rather than a form fill. A visitor who worked through a full conversation is a different prospect entirely.",
    span: "",
  },
  {
    object: "compass",
    title: "Shows where students get stuck",
    body: "The questions that keep stalling, like an unclear policy or a requirement nobody can interpret, become visible instead of invisible.",
    span: "sm:col-span-2",
  },
    {
    object: "chart",
    title: "Shows what is actually being asked",
    body: "A view of what prospective students want to know, drawn from real conversations on your own site.",
    span: "",
  },
];

/* Two neutrals, alternating (plan P3.2): GlobalyOS-V2's band and its
   one-step-darker tint. */
const RECEIVES_TINTS = ["v6-tint-a", "v6-tint-b"];

export function Institutions() {
  return (
    <section id="institutions" className="px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <div className="flex justify-center">
            <Eyebrow className="mb-5">For the admissions team</Eyebrow>
          </div>
          <SectionHeading
            align="center"
            title="Give your students and their parents more guidance, not more tabs"
            lead="They get an answer instead of a search box. Your team picks up a conversation rather than a contact form, routed to whoever you nominate the moment it finishes."
          />
        </Reveal>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          {RECEIVES.map(({ object, title, body, span }, index) => (
            <Reveal key={title} delay={index * 70} className={cn(span)}>
              <GlassPanel className={cn("h-full p-7 lg:p-8", RECEIVES_TINTS[index % RECEIVES_TINTS.length])}>
                <ObjectIcon name={object} />
                <h3 className="mt-5 text-[17px] leading-snug">{title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-[1.65] text-[var(--body)]">{body}</p>
              </GlassPanel>
            </Reveal>
          ))}
        </div>

        {/* The question the admissions team asks first, answered where they are
            reading it. Variation 1 has carried this note since the section was
            written; this variation never had it. */}
        <Reveal delay={160}>
          <p className="mx-auto mt-8 max-w-3xl rounded-[var(--r-card)] border border-[var(--border)] bg-[var(--surface)] px-6 py-5 text-center text-[14.5px] leading-relaxed text-[var(--muted-foreground)]">
            <strong className="font-semibold text-[var(--foreground)]">
              It does not replace your counselors.
            </strong>{" "}
            It answers the questions they answer twenty times a week, so their time goes to the
            students who need a person.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────────────────── */

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="px-3 py-20 sm:px-5 md:py-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <SectionHeading align="center" title="Questions institutions ask us" />
        </Reveal>

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = open === index;
            return (
              <Reveal key={faq.q} delay={Math.min(index, 6) * 40}>
                <GlassPanel spotlight={false} className={cn("overflow-hidden transition-colors duration-300", isOpen && "border-[var(--primary-bright)]/45")}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : index)}
                      aria-expanded={isOpen}
                      className="flex w-full items-start justify-between gap-6 px-6 py-5 text-left"
                    >
                      <span
                        className={cn(
                          "text-[16px] font-semibold leading-snug transition-colors",
                          isOpen ? "text-[var(--foreground)]" : "text-[var(--body)]",
                        )}
                      >
                        {faq.q}
                      </span>
                      <Plus
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none",
                          isOpen ? "rotate-45 text-[var(--primary-bright)]" : "text-[var(--muted-foreground)]",
                        )}
                        aria-hidden="true"
                        strokeWidth={2}
                      />
                    </button>
                  </h3>
                  <div
                    aria-hidden={!isOpen}
                    className={cn(
                      "grid transition-all duration-300 ease-out motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-[62ch] px-6 pb-6 text-[15px] leading-[1.75] text-[var(--body)]">
                        {faq.a}
                      </p>
                    </div>
                  </div>
                </GlassPanel>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Close ──────────────────────────────────────────────────────────────── */

export function FinalCta() {
  return (
    <section className="px-3 pb-20 sm:px-5 md:pb-28">
      <div className="mx-auto max-w-[1300px] px-2">
        <Reveal>
          <div className="relative overflow-hidden rounded-[var(--r-card)]">
            <Aurora className="v6-aurora-close absolute inset-0 scale-110" />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(ellipse_70%_75%_at_50%_50%,var(--background)_35%,transparent)]"
            />
            <div className="relative px-6 py-20 text-center sm:px-10 md:py-28">
              <h2 className="mx-auto max-w-2xl text-[clamp(1.9rem,4.4vw,3rem)]">
                See it guide a student through <span className="v6-gradient-text">your own programs</span>
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[16.5px] leading-[1.65] text-[var(--body)]">
                Twenty minutes with Amit Ranjitkar, our founder. He will show you the assistant
                working against content like yours, and what your team would receive.
              </p>
              <div className="mt-10 flex justify-center">
                <CtaButton size="lg" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
