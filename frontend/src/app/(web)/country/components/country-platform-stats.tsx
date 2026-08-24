import { Building2, GraduationCap, Users, Briefcase } from "lucide-react";
import type { CountryDetail } from "../types";

export function CountryPlatformStats({
  country,
  institutionsCount,
  coursesCount,
  agentsCount,
}: Readonly<{ country: CountryDetail; institutionsCount: number; coursesCount: number; agentsCount: number }>) {
  // All four always render, em-dash when there's no number yet — the bar is a fixed 4-up grid in
  // v1, and dropping cells would leave it lopsided.
  const stats = [
    {
      icon: Building2,
      label: "Institutions",
      value: country.universities_count_label ?? String(institutionsCount),
    },
    { icon: GraduationCap, label: "Services", value: String(coursesCount) },
    { icon: Briefcase, label: "Agents", value: String(agentsCount) },
    { icon: Users, label: "Students", value: country.student_count_label ?? "—" },
  ];

  return (
    <section className="bg-foreground py-12 text-background">
      <div className="container mx-auto px-4">
        <p className="mb-8 text-center text-sm font-medium tracking-wider uppercase opacity-60">On Our Platform</p>
        <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <s.icon className="mx-auto mb-2 h-6 w-6 opacity-60" />
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="mt-1 text-sm opacity-60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
