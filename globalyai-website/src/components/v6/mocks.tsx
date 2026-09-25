"use client";

import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import {
  BadgeCheck,
  CalendarDays,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HelpCircle,
  Landmark,
  LogOut,
  Mail,
  MessagesSquare,
  Search,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-reveal";
import { useTimeline } from "@/hooks/use-timeline";

/**
 * Six interface mockups, in place of the stock photography the Gap section
 * used to carry (a library, a courtyard). The CEO's call, 23 Sep 2026: show
 * the interface, not the campus.
 *
 * They pair off, one pair per row of <ProblemSolution />: a search that buries
 * the answer against one that gives it, a bot that waits against one that
 * asks, an empty inbox against a qualified inquiry.
 *
 * Reworked 23 Sep 2026, on the note that every card in the section looked the
 * same. It was true, and it was a reading problem rather than a taste one: the
 * paragraph describing a failure and the picture of that failure were the same
 * dark panel with the same hairline, so the eye had nothing to catch on and
 * the section read as six paragraphs. Three things separate them now:
 *
 *  - Each figure card is a screen. <Chrome /> puts a window bar on top of it,
 *    which is the cheapest and most literal way to say "this is software"
 *    rather than "this is more prose".
 *  - Colour, which the section had none of. Every status here is its own hue
 *    rather than another grey: a red dead end, an amber nought, a green
 *    qualified, and file types that differ from each other at a glance.
 *  - Real pictures, in the page grid the search runs over. A university site
 *    is mostly photographs, and a grid of grey rectangles was not a picture of
 *    the thing being searched.
 *
 * Each one plays rather than sits. A mockup takes a step index and reveals
 * itself a beat at a time, so a search fills with results and a conversation
 * arrives a message at a time. Three things make that safe to do six times on
 * one page:
 *
 *  - Every part is always in the DOM and only its opacity changes, so a card
 *    never resizes mid-play and the row never reflows under the reader.
 *  - <MockStage /> drives each one off useTimeline, which holds its timer
 *    while the card is off screen. Six always-running loops on one page would
 *    otherwise be six timers competing for the main thread.
 *  - Under prefers-reduced-motion useTimeline settles on the final step at
 *    once and never ticks, so every mockup reads as a finished transcript
 *    rather than as something withheld behind motion the visitor declined.
 *
 * All six are aria-hidden: the card above each one already says in words what
 * it shows, and a screen reader does not want the same thing twice.
 */

export type MockProps = Readonly<{ step: number }>;

/**
 * Hold time per step, in order, for each mockup. The length sets how many
 * beats it has.
 */
export const MOCK_BEATS = {
  tabs: [950, 620, 620, 620, 900],
  chat: [850, 900, 850, 1100, 900],
  form: [900, 700, 700, 900],
  answer: [900, 1200, 900, 1000],
  guide: [1000, 900, 900],
  lead: [900, 900, 900, 600, 600, 600, 600, 800],
} as const;

/**
 * The reveal itself. A class rather than a wrapper component, because half of
 * these beats land on an <li> or a flex row that already has a job, and
 * wrapping those in a spare div would break the layout around them.
 */
function beat(shown: boolean) {
  return cn(
    "motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out",
    shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
  );
}

/**
 * The window bar every mockup wears. The three lights are the real traffic
 * colours rather than tinted greys, and they are most of the reason a figure
 * card no longer reads as a paragraph: a reader knows what a title bar is
 * before reading a word of what sits under it.
 */
function Chrome({
  icon: Icon,
  label,
  trailing,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  trailing?: ReactNode;
}>) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-3">
      <div className="flex shrink-0 gap-1.5">
        {["#ff5f57", "#febc2e", "#28c840"].map((colour) => (
          <span key={colour} className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1">
        <Icon className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        <span className="min-w-0 truncate text-[11px] text-[var(--muted-foreground)]">{label}</span>
      </div>
      {trailing}
    </div>
  );
}

/** The screen under the window bar. */
function Screen({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</div>;
}

/* ── The problem side ───────────────────────────────────────────────────── */

/**
 * The pages a university site is actually made of. Three are photographs,
 * because most of a university site is photographs and eight icon tiles would
 * be a picture of a filing cabinet rather than of a website.
 */
const PAGES = [
  { label: "Campus life", image: "/imagery/v6-campus.webp" },
  { label: "Entry requirements", icon: FileText, hue: "47 107 224" },
  { label: "Fees and funding", icon: FileSpreadsheet, hue: "25 198 230" },
  { label: "Study support", image: "/imagery/v6-library.webp" },
  { label: "Admissions policy", icon: Landmark, hue: "121 94 236" },
  { label: "MBA programme", icon: GraduationCap, hue: "83 197 120" },
  { label: "International", image: "/imagery/v6-courtyard.webp" },
  { label: "Applicant FAQ", icon: HelpCircle, hue: "250 193 0" },
] as const;

/** One page of the site, as a tile. Shared by the search grid and the sources
 *  strip on <AnswerMock />, so the two rows are visibly the same pages. */
function PageTile({
  page,
  className,
}: Readonly<{ page: (typeof PAGES)[number]; className?: string }>) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      {"image" in page ? (
        <Image src={page.image} alt="" fill sizes="140px" className="object-cover" />
      ) : (
        <span
          className="flex h-full items-center justify-center"
          style={{ background: `rgb(${page.hue} / 0.14)` }}
        >
          <page.icon className="h-4 w-4" style={{ color: `rgb(${page.hue})` }} />
        </span>
      )}
    </div>
  );
}

/** The tabs a student ends up with, in the order they opened them. */
const TABS = [
  { label: "Programmes", hue: "47 107 224" },
  { label: "Fees", hue: "25 198 230" },
  { label: "Admissions", hue: "121 94 236" },
  { label: "Prospectus.pdf", hue: "250 193 0" },
  { label: "Entry reqs", hue: "83 197 120" },
] as const;

/**
 * The trawl. A student looking for one fact does not read a website, they open
 * it: five tabs, a search in each, and no answer in any of them.
 *
 * The tab strip is the whole point of the card and it deliberately runs off the
 * right edge rather than shrinking to fit — a tab bar that has outgrown its
 * window is a thing every visitor has seen, and it says "and more than these"
 * without a line of copy.
 */
export function MultiSiteMock({ step }: MockProps) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      {/* A tab strip in place of <Chrome />: same window bar, but the lights
          share it with what the student has had to open. */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-hidden border-b border-[var(--border)] px-3 py-2.5">
        <div className="flex shrink-0 gap-1.5 pr-1">
          {["#ff5f57", "#febc2e", "#28c840"].map((colour) => (
            <span key={colour} className="h-2.5 w-2.5 rounded-full" style={{ background: colour }} />
          ))}
        </div>
        {TABS.map((tab, index) => (
          <span
            key={tab.label}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[10.5px]",
              index === TABS.length - 1
                ? "bg-[var(--surface)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)]",
              beat(step >= Math.min(index, 1)),
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(${tab.hue})` }} />
            {tab.label}
            <X className="h-2.5 w-2.5 shrink-0 opacity-50" />
          </span>
        ))}
      </div>

      <Screen className="gap-3 p-4">
        <div className="flex items-center gap-2.5 rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
          <span className="min-w-0 truncate text-[13px] text-[var(--body)]">
            do I need work experience for the MBA
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
            512 results
          </p>
          <p className={cn("text-[11px] text-[var(--muted-foreground)]", beat(step >= 1))}>
            across 5,000 pages
          </p>
        </div>

        {/* The grid, and the sweep crossing it. Eight tiles arriving two at a
            time, the lower row fainter, so what the visitor is shown is the
            depth rather than the eight. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <span className="v6-sweep pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-[linear-gradient(180deg,transparent,rgb(var(--fig,47_107_224)/0.3),transparent)]" />

          <ul className="grid grid-cols-4 gap-2">
            {PAGES.map((page, index) => {
              const shown = step >= Math.floor(index / 2) + 1;
              return (
                <li
                  key={page.label}
                  className="overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface)] motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out"
                  /* The depth fade rides on the inline opacity, so it has to
                     carry the reveal too. */
                  style={{
                    opacity: shown ? 1 - Math.floor(index / 4) * 0.5 : 0,
                    transform: shown ? "none" : "translateY(8px)",
                  }}
                >
                  <PageTile page={page} className="aspect-[5/3]" />
                  <p className="min-w-0 truncate px-1.5 py-1 text-[9.5px] text-[var(--muted-foreground)]">
                    {page.label}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Where the answer actually was. It lands last, once the visitor has
            been shown how far down it sits. */}
        <p
          className={cn(
            "flex items-center gap-1.5 text-[11.5px] text-[var(--muted-foreground)]",
            beat(step >= 4),
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#febc2e]" />
          The answer is on page 27 of the prospectus PDF
        </p>
      </Screen>
    </div>
  );
}

/** A message, from whichever side. */
function Bubble({
  from,
  children,
  className,
}: Readonly<{ from: "them" | "us"; children: ReactNode; className?: string }>) {
  if (from === "us") {
    return (
      <div className={cn("flex justify-end", className)}>
        <p className="max-w-[80%] rounded-[var(--r-chip)] bg-[var(--primary-bright)] px-3.5 py-2.5 text-[13px] font-medium text-white">
          {children}
        </p>
      </div>
    );
  }
  return (
    <div className={cn("flex max-w-[88%] items-end justify-start gap-2", className)}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-3)]">
        {/* Grey and faceless, deliberately: the bot in these cards has no
            identity, and Aly has one. */}
        <User className="h-3 w-3 text-[var(--muted-foreground)]" />
      </span>
      <p className="rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--body)]">
        {children}
      </p>
    </div>
  );
}

/** The red strip under a conversation that went nowhere. */
function DeadEnd({ shown, children }: Readonly<{ shown: boolean; children: ReactNode }>) {
  return (
    <div
      className={cn(
        "mt-auto flex items-center gap-2 rounded-[var(--r-chip)] bg-[#ff5f57]/10 px-3 py-2",
        beat(shown),
      )}
    >
      <LogOut className="h-3.5 w-3.5 shrink-0 text-[#ff5f57]" />
      <p className="text-[12px] text-[var(--muted-foreground)]">{children}</p>
    </div>
  );
}

/**
 * The generic-bot half: it answers, and what it answers is not the question.
 *
 * The exchange was one polite, roughly-correct reply, which made the card an
 * argument about tone. It is not: the failure is that a keyword matcher hears
 * "MBA" and returns the MBA page, hears the question a second time and returns
 * the same page, and never once registers that it was asked about experience.
 * Two rounds, because a bot missing the point once is bad luck and twice is the
 * product.
 */
export function ChatMock({ step }: MockProps) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      <Chrome icon={MessagesSquare} label="Website assistant" />

      <Screen className="gap-2.5 p-5">
        <Bubble from="us" className={beat(step >= 1)}>
          Do I need work experience for the MBA?
        </Bubble>

        <Bubble from="them" className={beat(step >= 2)}>
          Thanks for your interest in the MBA! You can explore the programme here:
          /study/mba-full-time
        </Bubble>

        <Bubble from="us" className={beat(step >= 3)}>
          That page doesn&apos;t say. Do I need experience?
        </Bubble>

        <Bubble from="them" className={beat(step >= 4)}>
          I&apos;m sorry, I didn&apos;t understand. Try the Admissions page.
        </Bubble>

        <DeadEnd shown={step >= 4}>Visitor left the page</DeadEnd>
      </Screen>
    </div>
  );
}

/** The fields the widget demands before it will say anything. */
const FORM_FIELDS = ["Full name", "Email address", "Phone number"] as const;

/**
 * The form half: a chat widget that opens by asking who you are.
 *
 * This replaced an empty inbox, which showed the consequence of the failure
 * rather than the failure. The consequence is easy to state in the copy beside
 * it; what it could not state is the moment itself, which is a box that wants
 * three fields from a stranger before it has been the least bit useful. Nobody
 * fills that in, and the card should show why rather than count the result.
 */
export function FormMock({ step }: MockProps) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      <Chrome icon={MessagesSquare} label="Chat with admissions" />

      <Screen className="gap-3 p-5">
        <Bubble from="them">Before we begin, please complete your details.</Bubble>

        <div className="ml-8 space-y-2">
          {FORM_FIELDS.map((field, index) => (
            <div
              key={field}
              className={cn(
                "flex items-center justify-between rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5",
                beat(step >= index + 1),
              )}
            >
              <span className="text-[12.5px] text-[var(--muted-foreground)]">{field}</span>
              <span className="text-[11px] font-semibold text-[#ff5f57]">Required</span>
            </div>
          ))}
        </div>

        <DeadEnd shown={step >= 3}>Closed without a word typed</DeadEnd>
      </Screen>
    </div>
  );
}

/* ── The solution side ──────────────────────────────────────────────────
   Three "after" mockups, so each row shows the fix as well as the failure.
   The problem cards carry an interface each; without these the solution
   panels were three lines of text beside a full screenshot, and the eye read
   the failure as the substantial half. */

/** Aly's face, on the two cards where the answer is hers. */
function AlyAvatar() {
  return (
    <span className="v6-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
      <Sparkles className="h-3 w-3 text-white" />
    </span>
  );
}

/** 01: the same question, answered, with the page it came from named. */
export function AnswerMock({ step }: MockProps) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      <Chrome
        icon={Sparkles}
        label="Aly"
        trailing={
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#28c840]/15 px-2 py-1 text-[10.5px] font-semibold text-[#28c840]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
            Live
          </span>
        }
      />

      <Screen className="justify-center gap-3 p-5">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-[var(--r-chip)] bg-[var(--primary-bright)] px-3.5 py-2.5 text-[13px] font-medium text-white">
            Do I need work experience for the MBA?
          </p>
        </div>

        <div className={cn("flex items-end justify-start gap-2", beat(step >= 1))}>
          <AlyAvatar />
          <p className="max-w-[88%] rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] leading-[1.55] text-[var(--body)]">
            The full-time MBA asks for three or more years of professional experience. The MSc
            Management has no experience requirement.
          </p>
        </div>

        <span
          className={cn(
            "ml-8 inline-flex w-fit items-center gap-1.5 rounded-full bg-[#28c840]/10 px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]",
            beat(step >= 2),
          )}
        >
          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#28c840]" />
          From your admissions requirements page
        </span>

        {/* The same tiles the search buried the answer under, on the side that
            read them. It is the one place on the row where the two cards show
            the identical object, which is what makes the pair read as one
            argument rather than as two screenshots. */}
        <div className={cn("ml-8 flex items-center gap-2", beat(step >= 3))}>
          <span className="shrink-0 text-[10.5px] text-[var(--muted-foreground)]">Read</span>
          {PAGES.slice(0, 4).map((page) => (
            <PageTile
              key={page.label}
              page={page}
              className="h-7 w-10 shrink-0 rounded-[6px] border border-[var(--border)]"
            />
          ))}
          <span className="shrink-0 text-[10.5px] text-[var(--muted-foreground)]">
            and 4,996 more
          </span>
        </div>
      </Screen>
    </div>
  );
}

/** The two programs <GuideMock /> narrows to, each with its own colour. */
const PROGRAMS = [
  { name: "Full-time MBA", meta: "12 months · September", icon: GraduationCap, hue: "47 107 224" },
  { name: "MSc Management", meta: "12 months · September", icon: CalendarDays, hue: "25 198 230" },
] as const;

/** 02: it asks the question a counselor would, then narrows to two programs. */
export function GuideMock({ step }: MockProps) {
  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      <Chrome icon={Sparkles} label="Aly · guiding" />

      <Screen className="gap-3 p-5">
        <div className="flex items-end justify-start gap-2">
          <AlyAvatar />
          <p className="max-w-[88%] rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--body)]">
            Are you working at the moment, or studying?
          </p>
        </div>

        <div className={cn("flex justify-end", beat(step >= 1))}>
          <p className="rounded-[var(--r-chip)] bg-[var(--primary-bright)] px-3.5 py-2.5 text-[13px] font-medium text-white">
            Working, four years in finance.
          </p>
        </div>

        <div className={cn("ml-8 grid gap-2 sm:grid-cols-2", beat(step >= 2))}>
          {PROGRAMS.map(({ name, meta, icon: Icon, hue }) => (
            <div
              key={name}
              className="flex items-center gap-2.5 rounded-[var(--r-chip)] border bg-[var(--surface)] px-3 py-2.5"
              style={{ borderColor: `rgb(${hue} / 0.3)` }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: `rgb(${hue} / 0.14)` }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: `rgb(${hue})` }} />
              </span>
              <div className="min-w-0">
                <p className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--foreground)]">
                  {name}
                </p>
                <p className="mt-0.5 min-w-0 truncate text-[11px] text-[var(--muted-foreground)]">{meta}</p>
              </div>
            </div>
          ))}
        </div>
      </Screen>
    </div>
  );
}

const LEAD_FIELDS = [
  ["Name", "Priya R."],
  ["Email", "priya.r@email.com"],
  ["Interest", "Full-time MBA, September"],
] as const;

/**
 * 03: the same name, asked for last instead of first.
 *
 * It used to open on the finished inquiry card, which showed admissions what
 * they receive but not how it was got — and how it was got is the entire
 * difference from the form beside it. So the conversation comes first and is
 * useful before it asks for anything; the name is the price of a thing already
 * offered rather than the toll on the way in, and the inquiry assembles itself
 * out of what was said rather than out of what was demanded.
 */
export function LeadMock({ step }: MockProps) {
  const settled = step >= LEAD_FIELDS.length + 4;

  return (
    <div aria-hidden="true" className="flex h-full flex-col">
      <Chrome icon={Mail} label="Aly · handing over" />

      <Screen className="gap-2.5 p-5">
        <div className="flex items-end justify-start gap-2">
          <AlyAvatar />
          <p className="max-w-[88%] rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[13px] text-[var(--body)]">
            You qualify for the September intake. Shall I have an advisor confirm it?
          </p>
        </div>

        <div className={cn("flex justify-end", beat(step >= 1))}>
          <p className="rounded-[var(--r-chip)] bg-[var(--primary-bright)] px-3.5 py-2.5 text-[13px] font-medium text-white">
            Yes please — Priya R.
          </p>
        </div>

        {/* The inquiry, assembling out of the conversation above it rather than
            out of a form. */}
        <div
          className={cn(
            "mt-1 rounded-[var(--r-chip)] border border-[var(--border)] bg-[var(--surface)] p-3",
            beat(step >= 2),
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="v6-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                PR
              </span>
              <p className="min-w-0 truncate text-[12px] font-semibold text-[var(--foreground)]">
                New inquiry
              </p>
            </div>
            {/* Qualified lands only once the fields it is a judgement about
                have arrived, which is why it is the last beat rather than the
                first. */}
            <span
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full bg-[#28c840]/15 px-2 py-0.5 text-[10.5px] font-semibold text-[#28c840]",
                beat(settled),
              )}
            >
              <BadgeCheck className="h-3 w-3" />
              Qualified
            </span>
          </div>

          <dl className="mt-2.5 space-y-1.5">
            {LEAD_FIELDS.map(([key, value], index) => (
              <div
                key={key}
                className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2", beat(step >= index + 3))}
              >
                <dt className="text-[11px] text-[var(--muted-foreground)]">{key}</dt>
                <dd className="min-w-0 truncate text-[12px] font-medium text-[var(--foreground)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <p
          className={cn(
            "mt-auto text-[11.5px] text-[var(--muted-foreground)]",
            beat(settled),
          )}
        >
          Full transcript attached · sent to admissions
        </p>
      </Screen>
    </div>
  );
}

/**
 * Drives one mockup: holds the timer while the card is off screen, loops, and
 * settles on the last beat under reduced motion.
 */
export function MockStage({
  mock: Mock,
  beats,
  className,
}: Readonly<{
  mock: ComponentType<MockProps>;
  beats: readonly number[];
  className?: string;
}>) {
  const { ref, inView } = useInView<HTMLDivElement>("-8% 0px");
  const { step } = useTimeline({ durations: beats, active: inView, restDelay: 1700 });

  return (
    <div ref={ref} className={cn("h-full", className)}>
      <Mock step={step} />
    </div>
  );
}
