"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Clock, ExternalLink, MapPin, Plus, Presentation } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";
import { InstitutionLogo } from "./institution-logo";

type CourseCardProps = {
  card: CourseCardType;
};

/** "on_campus" → "On campus", "full_time" → "Full time" — wire enums are not for humans. */
function prettify(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFee(amount: number | null, currency: string): string | null {
  // Number() guard: cards persisted before the wire-mapper fix still carry the fee
  // as a Postgres-numeric string, and String#toLocaleString would skip the separators.
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${currency} ${n.toLocaleString("en-US")}`;
}

/** Extraction data often lacks degree_level, but the course name usually carries it. */
function degreeLevelOf(card: CourseCardType): string {
  if (card.degree_level) return prettify(card.degree_level);
  // Anywhere in the name, not just the start — "CHC52021- Diploma of ..." style titles
  // from older messages carry a code before the level word.
  const m = /\b(Graduate Certificate|Graduate Diploma|Bachelor|Master|Doctor|PhD|Diploma|Certificate|Associate)\b/i
    .exec(card.course_name);
  return m?.[0] ?? "";
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-xs font-medium text-foreground" title={value}>{value}</p>
      </div>
    </div>
  );
}

/** AI card → the shared compare store's item shape (same store as the search page). */
function toCompareItem(card: CourseCardType): CompareCourseItem {
  return {
    id: card.id ?? `${card.institution_name}-${card.course_name}`,
    slug: card.slug ?? "",
    name: card.course_name,
    institutionName: card.institution_name,
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
  const modes = card.study_modes.map(prettify).join(" · ");
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const hasDetails = Boolean(card.duration || card.intakes.length > 0 || modes);

  return (
    <Card
      size="sm"
      className="relative flex h-full w-full flex-col gap-0 overflow-hidden py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      {/* Decorative brand wash behind the header — the logo sits on top of it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent"
      />

      {/* Header */}
      <div className="relative flex items-start gap-3 px-4 pt-4">
        <InstitutionLogo name={card.institution_name} logoUrl={card.institution_logo_url} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-xs font-semibold text-foreground" title={card.institution_name}>
            {card.institution_name}
          </p>
          {place && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
        </div>
      </div>

      {/* Course title + level */}
      <div className="relative px-4 pt-3">
        <p
          className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground"
          title={card.course_name}
        >
          {card.course_name}
        </p>
        {degreeLevelOf(card) && (
          <Badge variant="secondary" className="mt-2 border-0 bg-primary/10 text-primary">
            {degreeLevelOf(card)}
          </Badge>
        )}
      </div>

      {/* Tuition gets its own strip — it's the number students scan for first. */}
      {fee && (
        <div className="mx-4 mt-3 flex items-baseline justify-between rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tuition
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {fee}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">/ year</span>
          </span>
        </div>
      )}

      {/* Details — the section disappears entirely when the card has none of the
          fields, so there's no empty padded band. */}
      {hasDetails && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-4 py-3">
          {card.duration && <DetailRow icon={Clock} label="Duration" value={card.duration} />}
          {card.intakes.length > 0 && (
            <DetailRow icon={CalendarDays} label="Intakes" value={card.intakes.join(", ")} />
          )}
          {modes && <DetailRow icon={Presentation} label="Study mode" value={modes} />}
        </div>
      )}

      {/* Actions — mt-auto pins this row to the card bottom so cards without
          details stay the same height as their row-mates, buttons aligned. */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2">
        {card.slug ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            render={<Link href={`/course/${card.slug}`} target="_blank" rel="noopener noreferrer" />}
          >
            View details <ArrowRight />
          </Button>
        ) : card.source_url ? (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            render={<a href={card.source_url} target="_blank" rel="noopener noreferrer" />}
          >
            View details <ExternalLink />
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant={added ? "secondary" : "outline"}
          size="sm"
          className="h-7 text-xs"
          disabled={added || compare.isFull}
          onClick={() => compare.add(compareItem)}
        >
          {added ? <><Check /> Added</> : <><Plus /> Compare</>}
        </Button>
      </div>
    </Card>
  );
}
