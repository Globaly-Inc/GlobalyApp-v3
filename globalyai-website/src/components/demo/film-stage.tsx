"use client";

import { ArrowRight, CalendarClock, Check, ChevronLeft, MessagesSquare } from "lucide-react";
import { AlyOrb } from "@/components/site/aly-orb";
import { cn } from "@/lib/utils";
import { CAL_BOOKING_URL } from "@/lib/site";
import { BrowserFrame, Bubble, Chip, Composer, PanelHeader, SiteBackdrop, Typing } from "./chat-ui";
import { DEMO_PROGRAMS, ProgramCard } from "./program-card";

/** The ten beats of the demo, in order. Captions double as the chapter list. */
export const FILM_BEATS = [
  { caption: "A prospective student lands on your website.", hold: 2600 },
  { caption: "GlobalyAI is there, on the pages you choose.", hold: 2600 },
  { caption: "They ask in their own words.", hold: 2900 },
  { caption: "It answers from your institution's content.", hold: 4000 },
  { caption: "Then it asks what a counselor would ask.", hold: 3400 },
  { caption: "The student explains a little more.", hold: 2800 },
  { caption: "It guides them to the programs that fit.", hold: 3800 },
  { caption: "And asks for contact details at the right moment.", hold: 3400 },
  { caption: "The chat ends, and your admissions team receives the inquiry that came out of it.", hold: 5200 },
  { caption: "Give your website an AI counselor.", hold: 4600 },
] as const;

/**
 * The three scenes are held to one height at sm and up: 704px, which is what
 * the closing frame comes to.
 *
 * Left to themselves they came out hundreds of pixels apart, so the card grew
 * and shrank mid-play — a quarter of it appearing and vanishing between beats.
 * They are levelled up to the tallest rather than the tallest being cut down:
 * the space costs the conversation scene nothing, since the backdrop is a
 * website and simply shows more page while the panel stays pinned bottom
 * right, and the transcript has more conversation than it can show anyway.
 *
 * Below sm the backdrop is hidden and each scene is only as tall as its own
 * content, so the floor is left off there — except the transcript, which says
 * why in its own comment.
 */
export function FilmStage({ beat }: Readonly<{ beat: number }>) {
  if (beat >= 9) return <FinalFrame />;
  if (beat === 8) return <TranscriptScene />;
  return <ConversationScene beat={beat} />;
}

/** Beats 0–7: the website, the panel, and the conversation inside it. */
function ConversationScene({ beat }: Readonly<{ beat: number }>) {
  const panelOpen = beat >= 1;

  return (
    <BrowserFrame url="your-university.edu/programs" className="animate-fade-up">
      <div className="relative">
        <div className="hidden sm:block">
          <SiteBackdrop className="min-h-[650px]" />
        </div>

        <div
          className={cn(
            "sm:absolute sm:bottom-4 sm:right-4 sm:w-[320px]",
            "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            panelOpen ? "opacity-100 sm:translate-y-0" : "opacity-0 sm:translate-y-5",
          )}
        >
          <div className="overflow-hidden border-[var(--border)] sm:rounded-[20px] sm:border sm:shadow-[0_24px_50px_-20px_rgb(2_14_40/0.4)]">
            <PanelHeader />
            <div className="flex h-[360px] flex-col justify-end gap-2.5 overflow-hidden bg-[var(--surface-soft)] px-3.5 py-3.5 sm:h-[352px]">
              {beat >= 1 && (
                <Bubble from="ai">Hi, I&apos;m your AI counselor. What would you like to know?</Bubble>
              )}

              {beat >= 2 && <Bubble from="user">Do I need work experience for the MBA?</Bubble>}

              {beat === 3 && <Typing label="GlobalyAI is checking your program information" />}

              {beat >= 4 && (
                <>
                  <Bubble from="ai">
                    The full-time MBA asks for three or more years of professional experience. The MSc
                    Management has no experience requirement.
                  </Bubble>
                  <SourceTag />
                </>
              )}

              {beat >= 4 && (
                <Bubble from="ai">Are you working at the moment, or studying?</Bubble>
              )}

              {beat >= 5 && <Bubble from="user">Working, four years in finance.</Bubble>}

              {beat >= 6 && (
                <>
                  <Bubble from="ai">Then you meet the MBA requirement. Both start in September:</Bubble>
                  {/* The suggestion arrives as the product's course cards
                      rather than as two lines of text — see <ProgramCard />.
                      They are dealt one after the other, because this is a
                      conversation and two cards landing in the same frame
                      reads as a search result. */}
                  <div className="space-y-2">
                    {DEMO_PROGRAMS.map((program, index) => (
                      <div
                        key={program.name}
                        className="animate-msg-in"
                        style={{ animationDelay: `${index * 160}ms`, animationFillMode: "both" }}
                      >
                        <ProgramCard program={program} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {beat >= 7 && (
                <>
                  <Bubble from="ai">
                    Shall I ask admissions to send you the entry criteria for both?
                  </Bubble>
                  <div className="flex flex-wrap gap-1.5 animate-msg-in">
                    <Chip picked>Yes, please</Chip>
                  </div>
                  <div
                    className="space-y-1.5 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/[0.04] p-2.5 animate-msg-in"
                    style={{ animationDelay: "180ms", animationFillMode: "both" }}
                  >
                    <FilmField label="Name" value="Sarah M." />
                    <FilmField label="Email" value="sarah.m@email.com" caret />
                  </div>
                </>
              )}
            </div>
            <Composer />
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/**
 * Beat 8: the inquiry, as the team reads it.
 *
 * The chat happens in a 320px panel, which is the truth of the product and the
 * wrong place to read it back from: at that width the answer runs to four lines
 * and the course cards are thumbnails. Admissions reads the same conversation
 * on a full screen, so this beat shows it there — the bubbles at reading size
 * and the cards large enough to see what was actually recommended.
 *
 * It is the same script as <ConversationScene />, deliberately, so the beat
 * reads as the conversation just watched rather than as a second one — minus
 * the assistant's opening hello, which leaves the seven messages the header
 * counts.
 *
 * The column is anchored to the bottom behind a short fade rather than trimmed
 * to fit. The scene may not grow (every scene is levelled to one height, see
 * above), and of the two ways to lose the overflow, dropping the end would
 * lose the handover the beat exists to show. Phones get a height too, unlike
 * every other scene: read at one message per screen the transcript is twice the
 * tallest beat around it, and the film would lurch on the way into it.
 */
function TranscriptScene() {
  return (
    <BrowserFrame url="admissions workspace / Sarah M." className="animate-fade-up">
      {/* --surface-subtle for the workspace behind the card, one step down
          from the --surface-soft the thread runs on. The ground moves rather
          than the card: a conversation has to keep its bubbles readable, and
          those are drawn on --card. */}
      <div className="flex h-[700px] flex-col bg-[var(--surface-subtle)] p-4 sm:h-[650px] sm:p-5">
        <article className="mx-auto flex min-h-0 w-full max-w-[860px] flex-1 flex-col overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--surface-soft)] shadow-[0_22px_50px_-28px_rgb(2_14_40/0.4)]">
          <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5">
            <ChevronLeft className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            <p className="truncate text-[13px] font-bold text-[var(--foreground)]">
              Sarah M. <span className="font-medium text-[var(--muted-foreground)]">· full conversation</span>
            </p>
            <span className="ml-auto hidden shrink-0 items-center gap-3 text-[11.5px] text-[var(--muted-foreground)] sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <MessagesSquare className="h-3 w-3" aria-hidden="true" />7 messages
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                Ended Tue, 9:42pm
              </span>
            </span>
          </header>

          <div className="relative flex min-h-0 flex-1 justify-center overflow-hidden px-4 py-3">
            <div className="flex w-full flex-col justify-end gap-2">
              <Bubble from="user" size="md">Do I need work experience for the MBA?</Bubble>

              <Bubble from="ai" size="md">
                The full-time MBA asks for three or more years of professional experience. The MSc
                Management has no experience requirement.
              </Bubble>
              <SourceTag size="md" />

              <Bubble from="ai" size="md">Are you working at the moment, or studying?</Bubble>

              <Bubble from="user" size="md">Working, four years in finance.</Bubble>

              <Bubble from="ai" size="md">
                Then you meet the MBA requirement. Both start in September:
              </Bubble>

              {/* Side by side here, stacked in the panel: the point of the beat
                  is that these are legible, and two full-width cards would push
                  the exchange above them off the top. */}
              <div className="grid gap-2 animate-msg-in sm:grid-cols-2">
                {DEMO_PROGRAMS.map((program) => (
                  <ProgramCard key={program.name} program={program} size="md" />
                ))}
              </div>

              <Bubble from="ai" size="md">
                Shall I ask admissions to send you the entry criteria for both?
              </Bubble>

              <Bubble from="user" size="md">Yes, please</Bubble>

              <div className="flex animate-msg-in items-center gap-2 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/[0.04] px-3 py-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]">
                  <Check className="h-3 w-3 text-white" aria-hidden="true" />
                </span>
                <p className="min-w-0 text-[12.5px] leading-snug text-[var(--foreground)]">
                  <span className="font-semibold">Details shared</span> · Sarah M. · sarah.m@email.com
                </p>
              </div>
            </div>

            {/* The earlier messages do not vanish, they run off the top.
                Deeper on a phone: five pixels of the thread overrun the card on
                a desktop, half a bubble does on a handset, and a cut that deep
                reads as a rendering fault unless something fades it. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(to_bottom,var(--surface-soft)_0px,var(--surface-soft)_34px,transparent_100%)] sm:h-6 sm:bg-[linear-gradient(to_bottom,var(--surface-soft),transparent)]"
            />
          </div>
        </article>
      </div>
    </BrowserFrame>
  );
}

/** Beat 9: the closing card. */
function FinalFrame() {
  return (
    <div className="flex min-h-[400px] animate-fade-up flex-col items-center justify-center gap-6 rounded-[20px] border border-white/12 bg-[#141b2e] px-6 py-16 text-center sm:min-h-[704px]">
      <AlyOrb className="h-14 w-14" />
      <h3 className="max-w-lg text-[clamp(1.4rem,3.2vw,2.15rem)] font-semibold leading-tight text-white">
        Give your website an{" "}
        <span className="text-[var(--accent)]">AI counselor</span>.
      </h3>
      <a
        href={CAL_BOOKING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex h-11 items-center gap-2 rounded-full bg-[var(--card)] px-6 text-sm font-semibold text-[var(--primary)] transition-transform hover:-translate-y-0.5"
      >
        Book a meeting
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </a>
    </div>
  );
}

function SourceTag({ size = "sm" }: Readonly<{ size?: "sm" | "md" }>) {
  return (
    <div className="flex animate-msg-in justify-start">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-[var(--card)] shadow-soft font-medium text-[var(--muted-foreground)]",
          size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11.5px]",
        )}
      >
        <span className="h-1 w-1 rounded-full bg-[var(--accent)]" aria-hidden="true" />
        From your admissions requirements page
      </span>
    </div>
  );
}

function FilmField({ label, value, caret = false }: Readonly<{ label: string; value: string; caret?: boolean }>) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--card)] shadow-soft px-2.5 py-1.5">
      <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="truncate text-[11.5px] text-[var(--foreground)]">
        {value}
        {caret && <span className="ml-px inline-block animate-caret text-[var(--primary)]">|</span>}
      </span>
    </div>
  );
}
