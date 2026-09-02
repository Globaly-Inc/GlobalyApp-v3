"use client";

import Link from "next/link";
import { CalendarDays, Check, Clock, GraduationCap, MapPin, Monitor, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "@/app/(web)/search/use-compare-tray";
import type { CompareCourseItem } from "@/app/(web)/search/types";
import type { CourseCard as CourseCardType } from "../apis/types";
import { InstitutionLogo } from "@/components/institution-logo";

type CourseCardProps = { card: CourseCardType };

function prettify(value: string): string {
  return value.replace(/_/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
}

function formatFee(amount: number | null, currency: string): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${currency} ${n.toLocaleString("en-US")}`;
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
  const place = [card.city, card.country].filter(Boolean).join(", ");
  const nextIntake = card.intakes[0] ?? null;
  const studyMode = card.study_modes?.[0] ? prettify(card.study_modes[0]) : null;
  const degreeLabel = degreeLevelOf(card);

  const href = card.slug ? `/course/${card.slug}` : (card.source_url ?? null);
  const isExternal = !card.slug && !!card.source_url;

  return (
    <div className="group relative flex h-72 w-full flex-col overflow-hidden rounded-2xl shadow-md ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
      {/* Card-wide link */}
      {href && (
        isExternal
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
          : <Link href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 z-10" aria-label={card.course_name} />
      )}

      {/* Full-bleed background */}
      {card.institution_cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.institution_cover_url}
          alt={card.institution_name}
          className="absolute inset-0 h-full w-full object-cover scale-100 transition-all duration-500 group-hover:scale-105 group-hover:blur-[2px]"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/70 to-primary/40" />
      )}

      {/* Base scrim */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      {/* Hover scrim */}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Logo — top-left */}
      <div className="relative z-20 p-3 pointer-events-none">
        <InstitutionLogo
          name={card.institution_name}
          logoUrl={card.institution_logo_url}
          className="size-10 rounded-xl ring-2 ring-white/30 shadow-md"
        />
      </div>

      {/* Compare button — top-right, above the link overlay */}
      <div className="absolute right-3 top-3 z-20">
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1 rounded-full px-2.5 text-[11px] backdrop-blur-sm ${
            added
              ? "bg-white/30 text-white"
              : "bg-black/30 text-white/80 hover:bg-white/20 hover:text-white"
          }`}
          disabled={added || compare.isFull}
          onClick={() => compare.add(compareItem)}
        >
          {added ? <><Check className="size-3" /> Added</> : <><Plus className="size-3" /> Compare</>}
        </Button>
      </div>

      {/* Content overlay — anchored to bottom, pointer-events-none so link overlay handles clicks */}
      <div className="relative z-20 mt-auto flex flex-col gap-1 p-4 pointer-events-none">
        {/* Institution + location */}
        <div className="flex items-center gap-1 text-[11px] text-white/80">
          <span className="font-semibold text-white">{card.institution_name}</span>
          {place && (
            <>
              <span>·</span>
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{place}</span>
            </>
          )}
        </div>

        {/* Course name */}
        <p className="line-clamp-2 text-base font-bold leading-snug text-white drop-shadow" title={card.course_name}>
          {card.course_name}
        </p>

        {/* Badges */}
        {(degreeLabel || studyMode) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {degreeLabel && (
              <Badge className="gap-0.5 border-0 bg-white/20 px-1.5 py-0 text-[10px] font-medium text-white backdrop-blur-sm">
                <GraduationCap className="size-2.5" />{degreeLabel}
              </Badge>
            )}
            {studyMode && (
              <Badge className="gap-0.5 border-0 bg-white/20 px-1.5 py-0 text-[10px] font-medium text-white backdrop-blur-sm">
                <Monitor className="size-2.5" />{studyMode}
              </Badge>
            )}
          </div>
        )}

        {/* Divider */}
        {(fee || card.duration || nextIntake) && (
          <div className="mt-1.5 border-t border-white/20" />
        )}

        {/* Fee + meta */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {card.duration && (
              <span className="flex items-center gap-1 text-[11px] text-white/85">
                <Clock className="size-3 shrink-0" />{card.duration}
              </span>
            )}
            {nextIntake && (
              <span className="flex items-center gap-1 text-[11px] text-white/85">
                <CalendarDays className="size-3 shrink-0" />Intake: {nextIntake}
              </span>
            )}
          </div>
          {fee && (
            <span className="shrink-0 text-sm font-bold tabular-nums text-white">
              {fee}<span className="ml-0.5 text-[10px] font-normal text-white/70">/yr</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
