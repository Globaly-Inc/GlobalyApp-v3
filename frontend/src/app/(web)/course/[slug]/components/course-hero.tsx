import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { safeUrl } from "@/lib/safe-url";
import type { CourseDetail } from "../../../search/types";

export function CourseHero({ course }: Readonly<{ course: CourseDetail }>) {
  const image = safeUrl(course.image_url);

  return (
    <section className="bg-linear-to-br from-primary/5 via-background to-primary/10 border-b border-border">
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs text-muted-foreground mb-4">
          <Link href="/" className="hover:text-primary">Home</Link> / <Link href="/search?tab=courses" className="hover:text-primary">Courses</Link> / {course.name}
        </p>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl border border-border bg-card shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt={course.name} className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-2xl font-bold text-primary">{course.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div>
            <Badge className="mb-2 bg-primary/10 text-primary border-primary/20 gap-1">
              <GraduationCap className="h-3 w-3" />Academic Courses
            </Badge>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{course.name}</h1>
            {course.subject_area && <p className="text-sm text-muted-foreground mt-0.5">{course.subject_area}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
