"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Check, GraduationCap, MapPin, Monitor, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";
import { InstitutionLogo } from "@/components/institution-logo";
import { FallbackImage } from "@/components/fallback-image";
import { getFingerprint } from "@/app/embed/[key]/utils";

type CourseCardProps = { card: CourseCardType };

function prettify(value: string): string {
  return value.replace(/_/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}

// Currency is nullable in the extraction data — an unlabelled figure beats "null 35,970",
// and the period comes from the card rather than being assumed annual: the same 1,090 is a
// per-credit rate at one institution and a semester's tuition at another.
const FEE_PERIOD_SUFFIX: Record<string, string> = {
  "per year": "/yr",
  "per semester": "/sem",
  "per trimester": "/tri",
  "per credit": "/credit",
  total: " total",
};

function formatFee(amount: number | null, currency: string): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return [currency, n.toLocaleString("en-US")].filter(Boolean).join(" ");
}

function degreeLevelOf(card: CourseCardType): string {
  if (card.degree_level) return prettify(card.degree_level);
  const m = /\b(Graduate Certificate|Graduate Diploma|Bachelor|Master|Doctor|PhD|Diploma|Certificate|Associate)\b/i.exec(card.course_name);
  return m?.[0] ?? "";
}

function toCompareItem(card: CourseCardType): CompareCourseItem {
  return {
    id: card.id ?? `${card.institution_name}-${card.course_name}`,
    slug: card.slug ?? "",
    name: card.course_name,
    institutionName: card.institution_name,
    institutionLogoUrl: card.institution_logo_url,
    countryName: card.country,
    durationLabel: card.duration || null,
    nextIntakeLabel: card.intakes[0],
    annualTuition: card.annual_tuition_fee,
    feeCurrency: card.currency || undefined,
  };
}

export function CourseCard({ card }: CourseCardProps) {
  const compare = useCompareTray();
  const compareItem = toCompareItem(card);
  const added = compare.has(compareItem.id);

  const fee = formatFee(card.annual_tuition_fee, card.currency);
  const feeSuffix = card.fee_period ? FEE_PERIOD_SUFFIX[card.fee_period] ?? ` ${card.fee_period}` : null;
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const nextIntake = card.intakes[0] ?? null;
  const studyMode = card.study_modes?.[0] ? prettify(card.study_modes[0]) : null;
  const degreeLabel = degreeLevelOf(card);

  // Inside a widget the card opens the institution's own branded course page, everywhere else
  // the website's. The panel runs at /embed/<key>, so the key is already in the path — reading
  // it here beats threading an embedKey prop down through ChatMessage and the card list, which
  // the dashboard chat would carry for nothing.
  const embedKey = /^\/embed\/([^/]+)/.exec(usePathname() ?? "")?.[1];
  // The card opens a TOP-LEVEL tab, and a third-party iframe's storage is partitioned by top-level
  // site — so that tab cannot see the visitor id the panel is using, and anything it offers back
  // to the chat would land on a stranger's empty thread. Hand the id over the way embed.js already
  // does it: in the hash, which no browser sends to a server. After mount, not during render —
  // localStorage during SSR is a hydration mismatch, and the hash is only needed once clicked.
  const [handoff, setHandoff] = useState("");
  useEffect(() => {
    if (embedKey) setHandoff(`#fp=${encodeURIComponent(getFingerprint())}`);
  }, [embedKey]);
  const coursePath = embedKey
    ? `/embed/${embedKey}/course/${card.slug}${handoff}`
    : `/course/${card.slug}`;
  const href = card.slug ? coursePath : (card.source_url ?? null);
  const isExternal = !card.slug && !!card.source_url;

  return (
    // The wrapper is the container: when the card is narrow (two per row in the website widget) it
    // goes compact — square, smaller type, fewer details. It has to be a wrapper, because an element
    // can't match a container query against itself (the card's own @max-…/card classes never
    // applied when it was its own container). overflow-hidden keeps aspect-square a hard square.
    // Full-width cards are unchanged.
    <div className="@container/card w-full">
      <div className="group relative flex h-80 w-full flex-col overflow-hidden rounded-2xl shadow-md ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl @max-[14rem]/card:h-auto @max-[14rem]/card:aspect-square @max-[14rem]/card:rounded-xl">
        {/* Card-wide link */}
        {href && (
          isExternal
            ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
            : <Link href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
        )}

        {/* Full-bleed background. The gradient is a LAYER, not an else-branch: a cover URL that
            403s (institution covers are often private-bucket links) hides its img and falls back
            to this instead of painting a broken-image icon across the card. */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/70 to-primary/40" />
        {card.institution_cover_url && (
          <FallbackImage
            src={card.institution_cover_url}
            alt={card.institution_name}
            className="absolute inset-0 h-full w-full object-cover scale-100 transition-all duration-500 group-hover:scale-105 group-hover:blur-[2px]"
          />
        )}

        {/* Base scrim */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
        {/* Hover scrim */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Logo — top-left */}
        <div className="relative z-20 p-3 pointer-events-none @max-[14rem]/card:p-2">
          <InstitutionLogo
            name={card.institution_name}
            logoUrl={card.institution_logo_url}
            className="size-14 rounded-xl ring-2 ring-white/30 shadow-md @max-[14rem]/card:size-10 @max-[14rem]/card:rounded-lg"
          />
        </div>

        {/* Compare button — top-right, above the link overlay */}
        <div className="absolute right-3 top-3 z-20 @max-[14rem]/card:right-2 @max-[14rem]/card:top-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label={added ? "Added to compare" : "Compare"}
            className={`h-7 gap-1 rounded-full px-2.5 text-xs backdrop-blur-sm @max-[14rem]/card:h-6 @max-[14rem]/card:px-1.5 ${
              added
                ? "bg-white/30 text-white"
                : "bg-black/30 text-white/80 hover:bg-white/20 hover:text-white"
            }`}
            disabled={added || compare.isFull}
            onClick={() => compare.add(compareItem)}
          >
            {added
              ? <><Check className="size-3" /><span className="@max-[14rem]/card:hidden">Added</span></>
              : <><Plus className="size-3" /><span className="@max-[14rem]/card:hidden">Compare</span></>}
          </Button>
        </div>

        {/* Content overlay — anchored to bottom, pointer-events-none so link overlay handles clicks */}
        <div className="relative z-20 mt-auto flex flex-col gap-1 p-4 pointer-events-none @max-[14rem]/card:gap-0.5 @max-[14rem]/card:p-2.5">
          {/* Institution + location, stacked.
              Sharing one line, "Asian Institute of Technology" became "Asian Institute of Tech…"
              and clipped the city after it — a card in the chat rail is ~240px. The name gets its
              own full-width line (up to two) and the place sits under it, so neither competes for
              the same pixels at any card width.
              `w-full` is load-bearing: line-clamp on a flex child that cannot shrink overflows
              instead of clamping. */}
          <div className="flex min-w-0 flex-col items-start text-xs text-white/80">
            <span className="line-clamp-2 w-full font-semibold text-white">{card.institution_name}</span>
            {place && (
              <span className="flex min-w-0 items-center gap-1 @max-[14rem]/card:hidden">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{place}</span>
              </span>
            )}
          </div>

          {/* Course name */}
          {/* text-shadow, not `drop-shadow`: a CSS filter on a line-clamped block makes Chromium paint
              ghost copies of the clipped lines over the title. Same look, no filter. */}
          <p className="line-clamp-3 text-base font-bold leading-snug text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)] @max-[14rem]/card:line-clamp-2 @max-[14rem]/card:text-[13px] @max-[14rem]/card:leading-tight" title={card.course_name}>
            {card.course_name}
          </p>

          {/* Badges */}
          {(degreeLabel || studyMode) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {degreeLabel && (
                <Badge className="gap-0.5 border-0 bg-white/20 px-1.5 py-0 text-xs font-medium text-white backdrop-blur-sm">
                  <GraduationCap className="size-2.5" />{degreeLabel}
                </Badge>
              )}
              {studyMode && (
                <Badge className="gap-0.5 border-0 bg-white/20 px-1.5 py-0 text-xs font-medium text-white backdrop-blur-sm">
                  <Monitor className="size-2.5" />{studyMode}
                </Badge>
              )}
            </div>
          )}

          {/* Divider — the facts below always render, so it always has something to divide. */}
          <div className="mt-1.5 border-t border-white/20" />

          {/* Intake on the left, fee on the right, icons instead of label words — in a 260px card
              the labels ate the width the values need. Both ALWAYS render ("Not listed" / "On
              enquiry" when absent): the old block dropped whichever fact a course lacked, so two
              cards in one reply had different rows and heights.
              ponytail: duration pulled out on request — extraction fills it from study options and
              a 208-week "duration" for a 2-year master's was doing more harm than good. Put the
              row back here when that number can be trusted. */}
          <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5 pt-1 @max-[14rem]/card:pt-0.5">
            <div className="flex min-w-0 flex-col gap-0.5 text-xs text-white/85">
              <span className="flex items-center gap-1" title={nextIntake ?? undefined}>
                <CalendarDays className="size-3 shrink-0" />{nextIntake ?? "Not listed"}
              </span>
            </div>
            {fee ? (
              <span className="shrink-0 text-sm font-bold tabular-nums text-white @max-[14rem]/card:text-xs">
                {fee}
                {feeSuffix && <span className="ml-0.5 text-xs font-normal text-white/70">{feeSuffix}</span>}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-white/75">On enquiry</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
