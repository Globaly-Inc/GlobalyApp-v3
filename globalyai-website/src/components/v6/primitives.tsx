"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAL_BOOKING_URL } from "@/lib/site";

/**
 * Variation 6's controls and surfaces.
 *
 * Two pointer behaviours live here, and both write CSS custom properties
 * directly to the element. Nothing continuous goes through React state: a
 * setState on pointermove re-renders the tree sixty times a second and falls
 * over on a mid-range phone.
 */

/**
 * Pulls an element a few pixels toward the cursor while the cursor is over
 * it. Capped at 6px, which is enough to feel alive and not enough to make the
 * button hard to hit.
 */
function useMagnetic<T extends HTMLElement>(strength = 6) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      el.style.setProperty("--mx", `${Math.max(-1, Math.min(1, dx)) * strength}px`);
      el.style.setProperty("--my", `${Math.max(-1, Math.min(1, dy)) * strength}px`);
    };

    const reset = () => {
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    el.addEventListener("blur", reset);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
      el.removeEventListener("blur", reset);
    };
  }, [strength]);

  return ref;
}

/** Writes the cursor's position within an element, for the spotlight fill. */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--sx", `${event.clientX - rect.left}px`);
      el.style.setProperty("--sy", `${event.clientY - rect.top}px`);
    };

    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, []);

  return ref;
}

export function CtaButton({
  className,
  size = "md",
  tone = "primary",
  label = "Book a meeting",
  href = CAL_BOOKING_URL,
  external = true,
}: Readonly<{
  className?: string;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "ghost";
  label?: string;
  href?: string;
  external?: boolean;
}>) {
  const ref = useMagnetic<HTMLAnchorElement>(tone === "primary" ? 6 : 4);

  const sizes = {
    sm: "h-10 px-4 text-[13.5px]",
    md: "h-12 px-6 text-[15px]",
    lg: "h-14 px-7 text-[15.5px]",
  } as const;

  return (
    <a
      ref={ref}
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "v6-magnetic group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold",
        tone === "primary"
          ? // White on the gradient's darkest stop is 5.1:1, and the gradient
            // only gets lighter toward the aqua end where the label is not.
            "v6-gradient text-white shadow-[0_14px_34px_-14px_rgb(47_107_224_/_0.7)]"
          : "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--primary-bright)]",
        sizes[size],
        className,
      )}
    >
      {label}
      <ArrowRight
        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
        aria-hidden="true"
        strokeWidth={2}
      />
    </a>
  );
}

/**
 * wide widens the heading block from max-w-2xl to max-w-4xl, for the one
 * title long enough to wrap at the default width. The lead keeps the narrow
 * measure either way, because a 900px line of body copy is hard to track.
 */
export function SectionHeading({
  title,
  lead,
  align = "left",
  className,
  wide = false,
}: Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
  wide?: boolean;
}>) {
  return (
    <div className={cn(wide ? "max-w-4xl" : "max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      <h2 className="text-[clamp(1.75rem,3.6vw,2.6rem)]">{title}</h2>
      {lead && (
        <p className={cn("mt-5 text-pretty text-[16px] leading-[1.7] text-[var(--body)]", wide && "mx-auto max-w-2xl")}>{lead}</p>
      )}
    </div>
  );
}

/** The page's one surface: frosted, spotlit, and the same radius everywhere. */
export function GlassPanel({
  children,
  className,
  id,
  spotlight = true,
  style,
}: Readonly<{
  children: ReactNode;
  className?: string;
  id?: string;
  spotlight?: boolean;
  /* For the one thing a class cannot carry: the per-row hue the figure cards
     in <ProblemSolution /> paint themselves with. */
  style?: CSSProperties;
}>) {
  const ref = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={spotlight ? ref : undefined}
      id={id}
      className={cn("v6-glass", spotlight && "v6-spot", className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)]/70 px-3.5 py-1.5 text-[13px] font-semibold text-[var(--primary-bright)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
