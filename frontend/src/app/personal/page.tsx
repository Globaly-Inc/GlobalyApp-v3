"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFullProfile } from "./store/profile-slice";
import { computeCompletion } from "./profile-completion";

export default function PersonalHomePage() {
  const dispatch = useAppDispatch();
  const { profile, qualifications, languageTests, status } = useAppSelector((state) => state.profile);

  useEffect(() => {
    if (status === "idle" && !profile) dispatch(fetchFullProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completion = profile ? computeCompletion(profile, qualifications, languageTests) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back{profile ? `, ${profile.first_name}` : ""}!</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s a snapshot of your Globaly profile.</p>
      </div>

      {completion && completion.percentage < 100 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complete your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Progress value={completion.percentage} className="h-2 flex-1" />
              <span className="text-sm font-medium text-muted-foreground">{completion.percentage}%</span>
            </div>
            <Button render={<Link href="/personal/profile" />} nativeButton={false} size="sm" className="gap-1.5">
              Finish your profile <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            View and manage your personal details, education background, test scores, and study preferences.
          </p>
          <Button render={<Link href="/personal/profile" />} nativeButton={false} variant="outline" size="sm" className="mt-3 gap-1.5">
            Go to profile <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
