import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { SearchCourse } from "../../search/types";
import { amountLabel } from "@/lib/utils";

export function CityServices({ cityName, courses }: Readonly<{ cityName: string; courses: SearchCourse[] }>) {
  if (courses.length === 0) return null;

  return (
    <Reveal>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Services in {cityName}</h2>
        <Button variant="outline" className="h-10" render={<Link href={`/search?tab=courses&city=${encodeURIComponent(cityName)}`} />}>
          View All <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <Link key={course.id} href={`/course/${course.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  <span className="truncate text-xs text-muted-foreground">{course.awarding_institution}</span>
                </div>
                <p className="text-sm font-semibold">{course.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  {course.subject_area && <Badge variant="outline" className="text-xs">{course.subject_area}</Badge>}
                  {course.international_fee_total && (
                    <span className="text-xs text-muted-foreground">
                      {amountLabel(course.international_fee_total, course.international_currency)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}
