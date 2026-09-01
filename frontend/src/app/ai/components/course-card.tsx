"use client";

import Link from "next/link";
import { CalendarDays, Check, Clock, MapPin, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";
import { InstitutionLogo } from "@/components/institution-logo";

type CourseCardProps = {
  card: CourseCardType;
};

function prettify(value: string): string {
  const spaced = value.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatFee(amount: number | null, currency: string): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${currency} ${n.toLocaleString("en-US")}`;
}

function degreeLevelOf(card: CourseCardType): string {
  if (card.degree_level) return prettify(card.degree_level);
  const m = /\b(Graduate Certificate|Graduate Diploma|Bachelor|Master|Doctor|PhD|Diploma|Certificate|Associate)\b/i
    .exec(card.course_name);
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
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const nextIntake = card.intakes[0] ?? null;

  // Card-wide link: internal slug wins, external source_url as fallback.
  const href = card.slug ? `/course/${card.slug}` : (card.source_url ?? null);
  const isExternal = !card.slug && !!card.source_url;

  return (
    <Card
      size="sm"
      className="group relative flex h-full w-full flex-col gap-0 overflow-hidden py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      {/* Card-wide clickable overlay — sits behind interactive children */}
      {href && (
        isExternal
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-0" aria-label={card.course_name} />
          : <Link href={href} className="absolute inset-0 z-0" aria-label={card.course_name} />
      )}

      {/* Cover image hero — falls back to a gradient brand wash when the institution has no cover */}
      {card.institution_cover_url ? (
        <div className="relative h-28 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.institution_cover_url}
            alt={card.institution_name}
            className="h-full w-full object-cover"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2.5 left-3">
            <InstitutionLogo name={card.institution_name} logoUrl={card.institution_logo_url} className="size-10 ring-2 ring-white/80" />
          </div>
        </div>
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent" />
      )}

      {/* Course name */}
      <div className={card.institution_cover_url ? "px-4 pt-3" : "relative px-4 pt-4"}>
        <p
          className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug tracking-tight text-foreground"
          title={card.course_name}
        >
          {card.course_name}
        </p>
        {degreeLevelOf(card) && (
          <Badge variant="secondary" className="mt-1.5 border-0 bg-primary/10 text-primary">
            {degreeLevelOf(card)}
          </Badge>
        )}
      </div>

      {/* Institution + location */}
      <div className={`flex items-center gap-2.5 px-4 pt-3 ${card.institution_cover_url ? "" : "relative"}`}>
        {!card.institution_cover_url && (
          <InstitutionLogo name={card.institution_name} logoUrl={card.institution_logo_url} />
        )}
        <div className="min-w-0">
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

      {/* Tuition strip */}
      {fee && (
        <div className="mx-4 mt-3 flex items-baseline justify-between rounded-lg border border-primary/15 bg-primary/[0.06] px-3 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tuition</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {fee}
            <span className="ml-1 text-[10px] font-normal text-muted-foreground">/ year</span>
          </span>
        </div>
      )}

      {/* Duration + next intake inline */}
      {(card.duration || nextIntake) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
          {card.duration && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 shrink-0" />
              {card.duration}
            </span>
          )}
          {nextIntake && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              Intake: {nextIntake}
            </span>
          )}
        </div>
      )}

      {/* Compare button — relative + z-10 so it sits above the card-wide link overlay */}
      <div className="relative z-10 mt-auto flex justify-end border-t bg-muted/20 px-4 py-2">
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
