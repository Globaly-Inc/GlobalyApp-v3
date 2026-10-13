"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DynamicIcon } from "@/components/dynamic-icon";
import { cn } from "@/lib/utils";
import type { BusinessCategoryOption } from "../apis/types";

export function BusinessTypeStep({
  categories,
  categoryId,
  setCategoryId,
  saving,
  handleContinueFromType,
}: Readonly<{
  categories: BusinessCategoryOption[];
  categoryId: string;
  setCategoryId: (value: string) => void;
  saving: boolean;
  handleContinueFromType: () => void;
}>) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">What type of business are you?</h1>
        <p className="text-muted-foreground mt-1">Choose the option that best describes your organisation.</p>
      </div>
      {categories.length === 0 ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map((cat) => (
            <Card
              key={cat.value}
              onClick={() => setCategoryId(cat.value)}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md border-2",
                categoryId === cat.value ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <CardContent className="p-5">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center mb-3",
                    categoryId === cat.value ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  <DynamicIcon name={cat.icon} fallback="Building2" className="h-5 w-5" />
                </div>
                <p className="font-semibold">{cat.label}</p>
                {cat.description && <p className="text-sm text-muted-foreground mt-1">{cat.description}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Button onClick={handleContinueFromType} disabled={!categoryId || saving} className="h-10 w-full cursor-pointer">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Continue
      </Button>
    </div>
  );
}
