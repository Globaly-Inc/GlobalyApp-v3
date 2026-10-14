"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Check, GraduationCap, MapPin, Monitor, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    // goes compact — smaller type, fewer details. It has to be a wrapper, because an element can't
    // match a container query against itself. Full-width cards keep every detail.
    <div className="@container/card h-full w-full">
      <Card className="group relative h-full gap-0 py-0 transition-shadow hover:shadow-md">
        {/* Card-wide link */}
        {href && (
          isExternal
            ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
            : <Link href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
        )}

        {/* Media strip. The gradient is a LAYER, not an else-branch: a cover URL that 403s
            (institution covers are often private-bucket links) hides its img and falls back to
            this instead of painting a broken-image icon. */}
        <div className="relative h-20 shrink-0 overflow-hidden bg-gradient-to-br from-primary via-primary/70 to-primary/40 @max-[14rem]/card:h-14">
          {card.institution_cover_url && (
            <FallbackImage
              src={card.institution_cover_url}
              alt={card.institution_name}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          {/* Compare button — above the link overlay */}
          <div className="absolute right-2 top-2 z-20">
            <Button
              variant={added ? "secondary" : "outline"}
              size="xs"
              aria-label={added ? "Added to compare" : "Compare"}
              className="rounded-full bg-card/90 text-xs backdrop-blur-sm"
              disabled={added || compare.isFull}
              onClick={() => compare.add(compareItem)}
            >
              {added
                ? <><Check /><span className="@max-[14rem]/card:hidden">Added</span></>
                : <><Plus /><span className="@max-[14rem]/card:hidden">Compare</span></>}
            </Button>
          </div>
        </div>

        {/* Body — pointer-events-none so the link overlay handles clicks */}
        <div className="pointer-events-none relative z-0 flex flex-1 flex-col gap-1.5 p-4 pt-0 @max-[14rem]/card:gap-1 @max-[14rem]/card:p-2.5 @max-[14rem]/card:pt-0">
          <InstitutionLogo
            name={card.institution_name}
            logoUrl={card.institution_logo_url}
            className="-mt-6 size-12 rounded-lg border-2 border-card bg-card shadow-sm @max-[14rem]/card:-mt-5 @max-[14rem]/card:size-9"
          />

          <p className="line-clamp-2 text-sm font-semibold leading-snug" title={card.course_name}>
            {card.course_name}
          </p>

          {/* Institution + location */}
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground">{card.institution_name}</span>
            {place && (
              <span className="contents @max-[14rem]/card:hidden">
                <span>·</span>
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{place}</span>
              </span>
            )}
          </div>

          {/* Badges */}
          {(degreeLabel || studyMode) && (
            <div className="flex flex-wrap gap-1">
              {degreeLabel && <Badge variant="secondary"><GraduationCap />{degreeLabel}</Badge>}
              {studyMode && <Badge variant="outline"><Monitor />{studyMode}</Badge>}
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
          <div className="flex items-end justify-between gap-2 pt-1 @max-[14rem]/card:pt-0.5">
            <div className="flex min-w-0 flex-col gap-0.5 text-xs text-white/85 @max-[14rem]/card:text-xs">
              <span className="flex items-center gap-1 truncate" title={nextIntake ?? undefined}>
                <CalendarDays className="size-3 shrink-0" />{nextIntake ?? "Not listed"}
              </span>
            </div>
            {fee ? (
              <span className="shrink-0 text-sm font-bold tabular-nums text-white @max-[14rem]/card:text-xs">
                {fee}
                {feeSuffix && <span className="ml-0.5 text-xs font-normal text-white/70">{feeSuffix}</span>}
              </span>
            ) : (
              <span className="shrink-0 text-xs font-medium text-white/75 @max-[14rem]/card:text-xs">On enquiry</span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
