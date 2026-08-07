"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchFlags, toggleFlag } from "../store/feature-flags-slice";

export function FeatureFlagsView() {
  const dispatch = useAppDispatch();
  const { flags } = useAppSelector((state) => state.platformFeatureFlags);

  useEffect(() => {
    dispatch(fetchFlags());
  }, [dispatch]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Feature Flags</h1>
        <p className="text-muted-foreground mt-1">Toggle platform-wide features on or off.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{flags.length} flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {flags.map((flag) => (
            <div key={flag.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <Checkbox
                id={flag.id}
                checked={flag.enabled}
                onCheckedChange={(checked) => dispatch(toggleFlag({ id: flag.id, enabled: checked === true }))}
              />
              <Label htmlFor={flag.id} className="text-sm font-medium text-foreground">
                {flag.label}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
