import { Building2, GraduationCap, Users, UserCheck } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export function CountryPlatformStats({
  institutionsCount,
  coursesCount,
  agentsCount,
  studentsCount,
}: Readonly<{ institutionsCount: number; coursesCount: number; agentsCount: number; studentsCount: number }>) {
  // Live counts, not the editor-entered *_count_label copy. Institutions, services and counselors
  // are scoped to this country by the same public search queries the tabs run; Students is the
  // platform-wide total from /platform-stats, the same figure the marketing stat bars show.
  //
  // Every row always renders. A zero is a real answer for a destination nobody has listed on
  // yet — dropping the row instead left a lopsided strip, or no strip at all.
  const stats = [
    { icon: Building2, label: "Institutions", value: institutionsCount },
    { icon: GraduationCap, label: "Services", value: coursesCount },
    { icon: UserCheck, label: "Education Counselors", value: agentsCount },
    { icon: Users, label: "Students", value: studentsCount },
  ];

  return (
    <section className="bg-foreground py-12 text-background">
      <div className="container mx-auto px-4">
        <p className="mb-8 text-center text-sm font-medium tracking-wider uppercase opacity-60">On Our Platform</p>
        <div className="grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <s.icon className="mx-auto mb-2 h-6 w-6 opacity-60" />
              <p className="text-3xl font-bold">{formatNumber(s.value)}</p>
              <p className="mt-1 text-sm opacity-60">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
