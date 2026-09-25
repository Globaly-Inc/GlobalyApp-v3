"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AlyOrb } from "@/components/site/aly-orb";
import { useInView } from "@/hooks/use-reveal";
import { useTimeline } from "@/hooks/use-timeline";

/**
 * The hero's right-hand panel: a conversation that plays itself.
 *
 * It asks each of three questions in turn, types the answer, cites the pages
 * it answered from, and on the last one does the thing the product actually
 * does at the end of a conversation, which is stop and call a person. Then it
 * loops.
 *
 * The three questions are the three a prospective student asks in the first
 * minute: can I get in, what does it cost, when does it start. The answers are
 * illustrative and the panel says so, because inventing specific entry
 * requirements for an institution we have never seen would be the cheapest lie
 * available on a marketing page.
 *
 * The question row is an indicator, not a control. An earlier version made the
 * three pills buttons and waited to be clicked, which cost the panel its whole
 * argument above the fold: a visitor who never clicks sees an empty box and a
 * prompt, and most visitors never click. A playhead runs under the active pill
 * so the row reads as a transcript position rather than as three buttons that
 * ignore the pointer, and the row is hidden from assistive tech — it restates
 * the question already sitting in the transcript beside it.
 *
 * Scrolling away pauses both the typing and the timeline, and scrolling back
 * resumes the current answer where it stopped.
 */

type Exchange = {
  question: string;
  answer: string;
  /** The pages this answer came from, as the panel reports them. */
  sources: string[];
  /** Set when the honest answer is to stop and fetch a person. */
  handoff?: string;
};

const EXCHANGES: readonly Exchange[] = [
  {
    question: "Is my degree enough to get in?",
    answer:
      "It depends on the program. For the MBA we look at your undergraduate degree and your work experience together, so tell me what you studied and how long you have been working.",
    sources: ["Entry requirements", "MBA program page"],
  },
  {
    question: "What does a year cost?",
    answer:
      "Tuition is published per program and per intake, and international fees differ from domestic ones. There are scholarships you may be eligible for depending on your grades and country.",
    sources: ["Tuition and fees", "Scholarships"],
  },
  {
    question: "Can I start in September?",
    answer:
      "September is our main intake and applications for it close earlier than most people expect. On your specific deadline I would rather our admissions team confirm than guess.",
    sources: ["Key dates"],
    handoff: "Sent to admissions with the whole conversation attached.",
  },
];

const TYPE_MS = 16;
/** Three characters a tick. One is too slow to finish before a reader loses
 *  interest, and the whole answer at once is not an answer being written, it
 *  is an answer being pasted. */
const CHARS_PER_TICK = 3;
/** Time the finished answer and its sources are held before the next question. */
const READ_MS = 4200;
/** The handoff line is one more thing to read on the last card. */
const HANDOFF_MS = 1400;

/** Each exchange lasts as long as it takes to type, plus time to read it. */
const DURATIONS = EXCHANGES.map(
  (exchange) =>
    Math.ceil(exchange.answer.length / CHARS_PER_TICK) * TYPE_MS +
    READ_MS +
    (exchange.handoff ? HANDOFF_MS : 0),
);

export function AskPanel({ className }: Readonly<{ className?: string }>) {
  const { ref, inView } = useInView<HTMLDivElement>("-10% 0px");
  const { step, reducedMotion } = useTimeline({ durations: DURATIONS, active: inView, restDelay: 600 });
  // The count carries the step it was counted for, so the retype is derived
  // rather than performed: a count left over from the previous exchange reads
  // as zero against the current one. Resetting it by hand would mean a
  // setState in the effect body, and two renders where one will do.
  const [progress, setProgress] = useState({ step: 0, count: 0 });

  const current = EXCHANGES[step] ?? EXCHANGES[0]!;
  const typed = reducedMotion
    ? current.answer.length
    : progress.step === step
      ? progress.count
      : 0;
  const complete = typed >= current.answer.length;

  useEffect(() => {
    // Under reduced motion useTimeline settles on the last exchange and never
    // ticks, so the panel is a finished transcript and there is nothing to type.
    if (reducedMotion || !inView) return;

    const answer = EXCHANGES[step]?.answer ?? "";
    const id = setInterval(() => {
      setProgress((previous) => {
        const count = previous.step === step ? previous.count : 0;
        if (count >= answer.length) {
          clearInterval(id);
          return previous;
        }
        return { step, count: Math.min(answer.length, count + CHARS_PER_TICK) };
      });
    }, TYPE_MS);

    return () => clearInterval(id);
  }, [step, inView, reducedMotion]);

  return (
    <div ref={ref} className={cn("v6-glass overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <span className="flex items-center gap-2.5">
          <AlyOrb className="h-6 w-6" />
          <span className="text-[14px] font-semibold text-[var(--foreground)]">Aly</span>
        </span>
        <span className="text-[12px] text-[var(--muted-foreground)]">illustrative answers</span>
      </header>

      <div
        className="h-[19rem] overflow-hidden px-5 py-5 sm:h-[20.5rem]"
        aria-label="An illustrative conversation with the assistant"
      >
        <div className="space-y-5">
          <p className="ml-auto w-fit max-w-[85%] rounded-[var(--r-chip)] bg-[var(--surface-2)] px-4 py-2.5 text-[14px] leading-[1.55] text-[var(--foreground)]">
            {current.question}
          </p>

          <div className="flex gap-3">
            <AlyOrb className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[14.5px] leading-[1.65] text-[var(--foreground)]">
                {current.answer.slice(0, typed)}
                {!complete && (
                  <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.15em] animate-pulse bg-[var(--primary-bright)]" />
                )}
              </p>

              {complete && (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-[var(--muted-foreground)]">Answered from</span>
                    {current.sources.map((source) => (
                      <span
                        key={source}
                        className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--body)]"
                      >
                        {source}
                      </span>
                    ))}
                  </div>

                  {current.handoff && (
                    <p className="rounded-[var(--r-chip)] border border-[var(--primary-bright)]/35 bg-[var(--primary-bright)]/10 px-3.5 py-2.5 text-[13px] leading-[1.5] text-[var(--foreground)]">
                      {current.handoff}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-[var(--border)] px-5 py-4" aria-hidden="true">
        <div className="flex flex-wrap gap-2">
          {EXCHANGES.map((exchange, index) => {
            const isCurrent = step === index;
            return (
              <span
                key={exchange.question}
                className={cn(
                  "relative overflow-hidden rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors duration-300",
                  isCurrent
                    ? "border-[var(--primary-bright)] bg-[var(--primary-bright)]/12 text-[var(--foreground)]"
                    : "border-[var(--border-strong)] text-[var(--muted-foreground)]",
                )}
              >
                {exchange.question}
                {isCurrent && (
                  <span
                    // Keyed by step so the playhead restarts with each question
                    // rather than carrying its progress across.
                    key={step}
                    className="v6-chip-progress absolute inset-x-0 bottom-0 h-[2px] bg-[var(--primary-bright)]"
                    style={{ animationDuration: `${DURATIONS[index]}ms` }}
                  />
                )}
              </span>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
