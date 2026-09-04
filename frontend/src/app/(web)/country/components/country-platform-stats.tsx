import { Building2, GraduationCap, Users, UserCheck } from "lucide-react";
import type { CountryDetail } from "../types";

export function CountryPlatformStats({
  country,
  institutionsCount,
  coursesCount,
  agentsCount,
}: Readonly<{ country: CountryDetail; institutionsCount: number; coursesCount: number; agentsCount: number }>) {
  // Every row always renders. A zero is a real answer for a destination nobody has listed on
  // yet — dropping the row instead left a lopsided strip, or no strip at all.
  const stats = [
    { icon: Building2, label: "Institutions", value: country.universities_count_label ?? String(institutionsCount) },
    { icon: GraduationCap, label: "Services", value: String(coursesCount) },
    { icon: UserCheck, label: "Education Counselors", value: String(agentsCount) },
    { icon: Users, label: "Students", value: country.student_count_label ?? "0" },
  ];

  return (
    <section className="bg-foreground py-12 text-background">
      <div className="container mx-auto px-4">
        <p className="mb-8 text-center text-sm font-medium tracking-wider uppercase opacity-60">On Our Platform</p>
        <div className="flex flex-wrap justify-center gap-x-12 gap-y-8 text-center">
          {stats.map((s) => (
            <div key={s.label} className="w-24 sm:w-28">
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
