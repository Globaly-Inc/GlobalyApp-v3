import { GraduationCap, Layers, LibraryBig, MapPin } from "lucide-react";

/**
 * The headline numbers for the institution's catalog, sat between the hero card and the
 * two-column body. V3-only — V1 had no equivalent strip.
 */
export function InstitutionStats({
  courseCount, subjectAreaCount, degreeLevelCount, campusCount,
}: Readonly<{
  courseCount: number;
  subjectAreaCount: number;
  degreeLevelCount: number;
  campusCount: number;
}>) {
  const stats = [
    { icon: GraduationCap, value: courseCount, label: courseCount === 1 ? "Course" : "Courses" },
    { icon: LibraryBig, value: subjectAreaCount, label: "Subject areas" },
    { icon: Layers, value: degreeLevelCount, label: "Degree levels" },
    { icon: MapPin, value: campusCount, label: campusCount === 1 ? "Location" : "Locations" },
  ];

  return (
    <div className="grid grid-cols-2 divide-border rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-x">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-3 px-5 py-4">
          <stat.icon className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight text-foreground">{stat.value}</p>
            <p className="truncate text-xs text-muted-foreground">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
