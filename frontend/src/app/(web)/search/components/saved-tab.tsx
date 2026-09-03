"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { httpGet } from "@/lib/api/http";
import { getAccessToken } from "@/lib/session";
import { CourseCard } from "./course-card";
import { InstitutionCard } from "./institution-card";
import type { SearchBusiness, SearchCourse } from "../types";

type SavedPayload = { courses: SearchCourse[]; institutions: SearchBusiness[] };

/**
 * V1's Saved tab. Client-rendered because the shortlist is scoped to the browser session's JWT,
 * which the server render has no access to.
 */
export function SavedTab() {
  const [saved, setSaved] = useState<SavedPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = Boolean(getAccessToken());
  // Strict Mode double-invokes effects in dev — without this the fetch fires twice on mount.
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || !signedIn) return;
    fetchedRef.current = true;
    httpGet<SavedPayload>("/saved?expand=true")
      .then((data) => setSaved({ courses: data.courses ?? [], institutions: data.institutions ?? [] }))
      .catch(() => setFailed(true));
  }, [signedIn]);

  if (!signedIn) {
    return (
      <EmptyState message="Sign in to see the courses and institutions you've saved.">
        <Link href="/auth/sign-in?redirect=/search%3Ftab%3Dsaved"><Button size="sm">Sign in</Button></Link>
      </EmptyState>
    );
  }

  if (failed) return <EmptyState message="Couldn't load your saved items. Try again in a moment." />;
  if (saved === null) return <EmptyState message="Loading your saved items…" />;

  const total = saved.courses.length + saved.institutions.length;
  if (total === 0) {
    return (
      <EmptyState message="Nothing saved yet — tap the heart on any course or institution to shortlist it.">
        <Link href="/search?tab=courses"><Button size="sm">Browse courses</Button></Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      <SavedGroup title="Institutions" count={saved.institutions.length}>
        {saved.institutions.map((i) => <InstitutionCard key={i.id} institution={i} />)}
      </SavedGroup>
      <SavedGroup title="Courses" count={saved.courses.length}>
        {saved.courses.map((c) => <CourseCard key={c.id} course={c} />)}
      </SavedGroup>
    </div>
  );
}

function SavedGroup({
  title, count, children,
}: Readonly<{ title: string; count: number; children: React.ReactNode }>) {
  if (count === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-foreground">{title} ({count})</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function EmptyState({ message, children }: Readonly<{ message: string; children?: React.ReactNode }>) {
  return (
    <div className="py-20 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Heart className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}
