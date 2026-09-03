"use client";

import { useState } from "react";
import {
  BarChart3, BookOpen, Briefcase, Cpu, FlaskConical, GraduationCap, Heart, Landmark, Languages,
  Leaf, Music, Palette, PenTool, Plane, Scale, Stethoscope, Wrench, type LucideIcon,
} from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import { ProfileSection } from "../../../components/profile/profile-section";
import { DEGREE_LABEL, type SubjectAreaSummary } from "../../../search/types";

const PAGE_SIZE = 6;

/* ── Subject-area icon mapper (ported from V1's BusinessPublicPreview) ── */
const AREA_ICONS: Record<string, LucideIcon> = {
  business: Briefcase, "business administration": Briefcase, management: Briefcase, commerce: Briefcase,
  finance: BarChart3, accounting: BarChart3, economics: BarChart3,
  engineering: Wrench, "computer science": Cpu, "information technology": Cpu, it: Cpu, computing: Cpu, technology: Cpu,
  medicine: Stethoscope, health: Heart, nursing: Heart, pharmacy: Stethoscope,
  law: Scale, "legal studies": Scale,
  arts: Palette, design: PenTool, "fine arts": Palette, "creative arts": Palette, music: Music,
  science: FlaskConical, biology: FlaskConical, chemistry: FlaskConical, physics: FlaskConical, mathematics: FlaskConical,
  education: GraduationCap, teaching: GraduationCap,
  hospitality: Plane, tourism: Plane, "travel & tourism": Plane,
  agriculture: Leaf, environmental: Leaf, sustainability: Leaf,
  "social science": Landmark, "political science": Landmark, history: Landmark, sociology: Landmark,
  languages: Languages, linguistics: Languages, "english language": Languages,
};

function areaIcon(areaName: string): LucideIcon {
  const key = areaName.toLowerCase().trim();
  if (AREA_ICONS[key]) return AREA_ICONS[key];
  // Extraction writes compound names ("Hospitality & Culinary") — first keyword hit wins.
  for (const [word, icon] of Object.entries(AREA_ICONS)) {
    if (key.includes(word)) return icon;
  }
  return BookOpen;
}

/** Intl rejects anything that isn't a 3-letter code, and scraped rows carry things like "AUD$". */
function formatCost(value: number, currency: string | null) {
  const code = (/[A-Za-z]{3}/.exec(currency ?? "")?.[0] ?? "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${code} ${Math.round(value).toLocaleString()}`;
  }
}

/**
 * V1's subject-area grid: one tile per area with its icon, course count, degree-level spread and
 * the fee range across the courses it holds.
 */
export function InstitutionSubjectAreas({
  areas, courseCount,
}: Readonly<{ areas: SubjectAreaSummary[]; courseCount: number }>) {
  const [page, setPage] = useState(1);
  if (areas.length === 0) return null;

  const visible = areas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <ProfileSection icon={BookOpen} title={`Courses (${courseCount})`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((area) => {
          const AreaIcon = areaIcon(area.name);
          return (
            <div key={area.name} className="space-y-2 rounded-xl border border-border bg-card p-4">
              <AreaIcon className="h-8 w-8 text-primary/60" />
              <p className="text-sm font-medium text-foreground">{area.name}</p>
              <p className="text-xs text-muted-foreground">{area.count} course{area.count === 1 ? "" : "s"}</p>

              {area.degrees.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {area.degrees.map((degree) => (
                    <span
                      key={degree.name}
                      className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-foreground"
                    >
                      {DEGREE_LABEL[degree.name] ?? degree.name} · {degree.count}
                    </span>
                  ))}
                </div>
              )}

              {area.cost_min != null && area.cost_max != null && (
                <p className="text-base font-semibold text-muted-foreground">
                  {area.cost_min === area.cost_max
                    ? formatCost(area.cost_min, area.currency)
                    : `${formatCost(area.cost_min, area.currency)} – ${formatCost(area.cost_max, area.currency)}`}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {areas.length > PAGE_SIZE && (
        <Pagination page={page} total={areas.length} limit={PAGE_SIZE} onPageChange={setPage} align="end" />
      )}
    </ProfileSection>
  );
}
