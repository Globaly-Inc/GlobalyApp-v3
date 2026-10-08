"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_ICON_ATTR } from "@/lib/public-assets";
import { useAppDispatch } from "@/lib/hooks";
import { markWelcomeSeen } from "@/app/business/store/business-onboarding-slice";
import { WelcomeFeatureCards, WelcomeFeatureSpread } from "./welcome-feature-cards";
import { WelcomeStage } from "./welcome-stage";
import styles from "./welcome-tour.module.css";

const CLOSE_MS = 2250;
/** Below this scale the text gets too small to read, so the page scrolls at its natural size instead. */
const MIN_FIT = 0.7;
/**
 * Nothing is on a timer. The 5s auto-close used to kill the screen a quarter of the way into the
 * feature cards' own 8s demo loops, so the counsellor's reply and the Lead badge were never seen.
 * Skip and the dashboard button are the only exits.
 */
const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

/** Deterministic (index-derived, not random) so server and client render the same sky. */
const STARS = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 53 + 7) % 100}%`,
  top: `${(i * 31 + 11) % 100}%`,
  size: 1 + (i % 3),
  duration: `${2.5 + (i % 4)}s`,
  delay: `${(i % 7) * 0.4}s`,
}));

/**
 * One-time welcome screen for an org onboarded from an invitation, played on /business/portal before
 * the dashboard. A single screen with an orchestrated sequence (see welcome-tour.module.css);
 * skippable, and static under reduced motion.
 *
 * `show` is decided entirely by the server — no `?welcome=1`, and no localStorage. The URL param was
 * a second source of truth that could be shared, replayed or lost across the OTP hop, and the
 * storage key was per BROWSER, so a second device replayed the splash. Now accepting an invitation
 * sets `business_onboarding_progress.welcome_pending` and dismissing clears it.
 *
 * The caller mounts this only once the onboarding row has loaded, so there is no frame where `show`
 * is still unknown and the splash appears just to be taken away again.
 */
export function WelcomeTour({ orgName, show }: Readonly<{ orgName: string; show: boolean }>) {
  const dispatch = useAppDispatch();

  // Decided once at mount: the caller waits for the onboarding row, so `show` is already settled.
  const [open, setOpen] = useState(show);
  const [closing, setClosing] = useState(false);
  const [iris, setIris] = useState<{ cx: number; cy: number; r0: number; r1: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (closeTimer.current) return;
    // Not awaited: the close animation must not wait on a round trip, and a failed write only
    // costs seeing the splash once more on a later visit.
    dispatch(markWelcomeSeen());
    const icon = document.querySelector<HTMLElement>(`[${APP_ICON_ATTR}]`);
    const rect = (icon ?? stageRef.current)?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    setIris({
      cx,
      cy,
      r0: Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)),
      r1: icon && rect ? Math.hypot(rect.width, rect.height) / 2 : 0,
    });
    frame.current = requestAnimationFrame(() => setClosing(true));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = setTimeout(() => setOpen(false), reduced ? 0 : CLOSE_MS);
  }, [dispatch]);

  useEffect(() => () => {
    clearTimeout(closeTimer.current);
    cancelAnimationFrame(frame.current);
  }, []);


  useEffect(() => {
    const main = mainRef.current;
    const box = fitRef.current;
    if (!open || !main || !box) return;
    const measure = () => {
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const next = Math.min(1, main.clientHeight / box.offsetHeight, main.clientWidth / box.offsetWidth);
      const scales = wide && Number.isFinite(next) && next >= MIN_FIT;
      main.dataset.fit = scales || !wide ? "scale" : "scroll";
      box.style.scale = scales ? String(next) : "";
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(box);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    ctaRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismiss]);

  if (!open) return null;

  const lead = ["Welcome", "to", "GlobalyApp"];
  const org = (orgName || "your business").split(" ");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to GlobalyApp"
      style={iris ? css({ "--cx": `${iris.cx}px`, "--cy": `${iris.cy}px`, "--r0": `${iris.r0}px`, "--r1": `${iris.r1}px` }) : undefined}
      className={cn(styles.root, closing && styles.leaving, "fixed inset-0 z-[100] mb-0 flex flex-col overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1a4fc4_0%,#012E8A_45%,#021a52_100%)] text-white")}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className={cn(styles.aurora1, "absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-[#23DDF6]/20 blur-3xl")} />
        <div className={cn(styles.aurora2, "absolute -bottom-40 -right-32 h-[34rem] w-[34rem] rounded-full bg-[#7FA6FF]/25 blur-3xl")} />
        {STARS.map((s, i) => (
          <span key={i} className={cn(styles.star, "absolute rounded-full bg-white")} style={css({ left: s.left, top: s.top, width: s.size, height: s.size, "--d": s.duration, "--s": s.delay })} />
        ))}
      </div>

      <span aria-hidden className={styles.iris} />

      <button
        type="button"
        onClick={dismiss}
        className={cn(styles.rise, styles.skip, "absolute right-4 top-4 z-10 cursor-pointer rounded-md px-3 py-1.5 text-sm text-white/70 transition-colors hover:text-white sm:right-6 sm:top-5")}
        style={css({ "--delay": "0.6s" })}
      >
        Skip
      </button>

      <main ref={mainRef} className={cn(styles.stage, "relative flex min-h-0 flex-1 px-6 max-lg:overflow-y-auto max-lg:pt-12 lg:items-center lg:justify-center lg:overflow-hidden lg:data-[fit=scroll]:items-start lg:data-[fit=scroll]:overflow-y-auto lg:data-[fit=scroll]:pt-12")}>
        {/* Stacked below lg. From lg: hero + button on the left, the three cards beside them, so the screen fits a laptop without scrolling. */}
        {/* Act two plays over the whole stage, so it sits outside the grid. */}
        <WelcomeFeatureSpread />

        <div ref={fitRef} className={cn("grid w-full max-w-7xl max-lg:m-auto lg:origin-center items-center gap-x-10 gap-y-6 py-4 max-lg:grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]")}>
          <div className={cn(styles.heroWrap, "flex flex-col items-center text-center lg:col-start-1 lg:row-start-1 lg:self-end")}>
            <WelcomeStage ref={stageRef} />

            <h1 className="mt-6 max-w-4xl font-heading text-3xl font-bold leading-[1.1] sm:text-5xl xl:text-6xl">
              {/* One line always: nowrap here, and the size steps down with the column width. */}
              <span className="block sm:whitespace-nowrap">
                {lead.map((w, i) => (
                  <span key={w} className={styles.word} style={css({ "--i": i })}>{w}&nbsp;</span>
                ))}
              </span>
              <span className="mt-1 block">
                {org.map((w, i) => (
                  <span key={`${w}-${i}`} className={styles.word} style={css({ "--i": lead.length + i })}>
                    <span className={styles.shimmer}>{w}</span>
                    {i < org.length - 1 && " "}
                  </span>
                ))}
              </span>
            </h1>

            <p className={cn(styles.rise, "mt-5 max-w-2xl text-base text-white/75 sm:text-lg lg:text-xl")} style={css({ "--delay": "1.9s" })}>
              Your account and portal are ready.
            </p>
          </div>

          <div className="flex justify-center lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <WelcomeFeatureCards />
          </div>

          <div className={cn(styles.ctaCell, "flex justify-center lg:col-start-1 lg:row-start-2 lg:self-start")}>
            <Button
              ref={ctaRef}
              onClick={dismiss}
              className={cn(styles.cta, styles.rise, "h-12 cursor-pointer gap-2 rounded-full bg-white px-8 text-base font-semibold text-[#012E8A] shadow-[0_10px_40px_rgba(35,221,246,0.35)] hover:bg-white/90")}
              style={css({ "--delay": "2.9s" })}
            >
              Take me to my dashboard
              <ArrowRight className={cn(styles.arrow, "h-5 w-5")} aria-hidden />
            </Button>
          </div>
        </div>
      </main>

    </div>
  );
}
