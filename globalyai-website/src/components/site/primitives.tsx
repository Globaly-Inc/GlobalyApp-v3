"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAL_BOOKING_URL } from "@/lib/site";
import { useReveal } from "@/hooks/use-reveal";

/** Fades a block up the first time it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: Readonly<{ children: ReactNode; className?: string; delay?: number; as?: "div" | "li" | "section" }>) {
  const { ref, visible } = useReveal<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      className={cn("reveal", className)}
      data-visible={visible || undefined}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * The one conversion control on the site, in the reference's signature shape:
 * a fully-round gradient pill with a white circular chevron badge sunk into
 * the right end. Every instance points at CAL_BOOKING_URL, so the real Cal
 * link is a one-line change in lib/site.ts.
 */
export function TalkToFounder({
  className,
  size = "md",
  tone = "brand",
  label = "Book a meeting",
}: Readonly<{ className?: string; size?: "sm" | "md" | "lg"; tone?: "brand" | "white"; label?: string }>) {
  // The badge sits in flow again, with the gap set explicitly.
  //
  // Pinning it right and padding symmetrically did center the label in the
  // pill, but centering against a 40px badge means carrying 64px of dead space
  // on the left to match — which read as a lopsided, over-padded button. The
  // eye doesn't measure the label against the whole pill anyway; it measures
  // it against the space it actually occupies. So the label is centered in what
  // is left over after the badge, which is both compact and what the
  // reference's own CTA does.
  const sizes = {
    sm: { pill: "h-10 pl-5 pr-1.5 gap-2.5 text-[14px]", badge: "h-7 w-7", icon: "h-3.5 w-3.5" },
    md: { pill: "h-12 pl-6 pr-1.5 gap-3.5 text-[15px]", badge: "h-9 w-9", icon: "h-4 w-4" },
    lg: { pill: "h-14 pl-7 pr-2 gap-4 text-[17px]", badge: "h-10 w-10", icon: "h-[18px] w-[18px]" },
  } as const;

  const brand = tone === "brand";
  const s = sizes[size];

  return (
    <a
      href={CAL_BOOKING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        // justify-center matters only when a caller stretches the button
        // (w-full, or a flex-col that stretches it): the label and badge then
        // sit as a centered pair rather than drifting to the left edge.
        "group inline-flex items-center justify-center rounded-full text-center font-semibold",
        "transition-all duration-300 hover:-translate-y-0.5",
        brand
          ? "bg-[linear-gradient(120deg,var(--primary),var(--primary-bright)_65%,#1e9fd0)] text-white shadow-[0_10px_26px_-10px_rgb(1_46_138/0.55)] hover:shadow-[0_14px_32px_-10px_rgb(1_46_138/0.6)]"
          : "bg-white text-[var(--primary)] shadow-soft hover:shadow-lift",
        s.pill,
        className,
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5",
          brand ? "bg-white text-[var(--primary)]" : "bg-[var(--primary)] text-white",
          s.badge,
        )}
        aria-hidden="true"
      >
        <ChevronRight className={s.icon} strokeWidth={2.75} />
      </span>
    </a>
  );
}

/** Secondary action: an in-page anchor, never a competing conversion. */
export function SecondaryLink({
  href,
  children,
  className,
}: Readonly<{ href: string; children: ReactNode; className?: string }>) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-semibold text-[var(--foreground)]",
        "shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:text-[var(--primary)] hover:shadow-lift",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Eyebrow: the Aly orb (or another mark), then the label. */
export function Eyebrow({
  children,
  icon,
  className,
}: Readonly<{ children: ReactNode; icon?: ReactNode; className?: string }>) {
  return (
    <p className={cn("eyebrow", className)}>
      {icon && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </p>
  );
}

/** Eyebrow + headline + optional standfirst, at one consistent rhythm. */
export function SectionHeading({
  eyebrow,
  eyebrowIcon,
  title,
  lead,
  align = "left",
  className,
}: Readonly<{
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  className?: string;
}>) {
  return (
    <div className={cn(align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl", className)}>
      {eyebrow && (
        <Eyebrow icon={eyebrowIcon} className={cn("mb-5", align === "center" && "justify-center")}>
          {eyebrow}
        </Eyebrow>
      )}
      {/* 40px at the reference's scale, at weight 600 — the semibold is what
          keeps a heading this large feeling approachable. */}
      <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.18]">{title}</h2>
      {lead && (
        <p
          className={cn(
            "mt-5 text-pretty text-[16px] leading-[1.65] text-[var(--body)] sm:text-[17px]",
            align === "center" && "mx-auto max-w-2xl",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}


