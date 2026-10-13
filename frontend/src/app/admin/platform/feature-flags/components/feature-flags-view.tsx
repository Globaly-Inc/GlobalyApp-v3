"use client";

import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFlags, toggleFlag } from "../store/feature-flags-slice";

export function FeatureFlagsView() {
  const dispatch = useAppDispatch();
  const { flags } = useAppSelector((state) => state.platformFeatureFlags);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchFlags());
  }, [dispatch]);

  return (
    <PageBody>
      <PageHeader title="Feature Flags" subtitle="Toggle platform-wide features on or off." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{flags.length} flags</CardTitle>
        </CardHeader>
        <CardContent>
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="flex items-center justify-between gap-6 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0"
            >
              <Label htmlFor={flag.id} className="min-w-0 text-sm font-medium text-foreground">
                {flag.label}
              </Label>
              <Switch
                id={flag.id}
                checked={flag.enabled}
                onCheckedChange={(checked) => dispatch(toggleFlag({ id: flag.id, enabled: checked === true }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </PageBody>
  );
}
