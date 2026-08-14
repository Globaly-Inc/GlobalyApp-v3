"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/field-error";
import { cn } from "@/lib/utils";
import { calculateSeoScore } from "../utils";
import type { BlogPost } from "../apis/types";

const CHECK_LABELS: Record<string, string> = {
  keywordInTitle: "Focus keyword in title",
  keywordInSlug: "Focus keyword in slug",
  keywordInIntro: "Focus keyword in intro",
  keywordDensity: "Keyword density 0.5–3%",
  titleLength: "Title length 30–60 chars",
  metaDescLength: "Meta description 120–160 chars",
  contentLength: "Content is at least 300 words",
  hasSubheadings: "Has subheadings",
  hasImages: "Has at least one image",
  hasFocusKeyword: "Focus keyword is set",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-destructive";
}

export function BlogSeoPanel({
  post,
  onChange,
  errors = {},
}: Readonly<{ post: Partial<BlogPost>; onChange: (updates: Partial<BlogPost>) => void; errors?: Record<string, string> }>) {
  const { score, checks } = calculateSeoScore(post);
  const metaTitleLen = post.meta_title?.length ?? 0;
  const metaDescLen = post.meta_description?.length ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>SEO</CardTitle>
        <span className={cn("text-2xl font-bold", scoreColor(score))}>{score}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="seo-focus-keyword">Focus keyword</Label>
          <Input
            id="seo-focus-keyword"
            className="h-9"
            value={post.focus_keyword ?? ""}
            onChange={(e) => onChange({ focus_keyword: e.target.value || null })}
            aria-invalid={!!errors.focus_keyword}
          />
          <FieldError message={errors.focus_keyword} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-meta-title">
            Meta title <span className="font-normal text-muted-foreground">({metaTitleLen}/60)</span>
          </Label>
          <Input
            id="seo-meta-title"
            className="h-9"
            maxLength={60}
            value={post.meta_title ?? ""}
            onChange={(e) => onChange({ meta_title: e.target.value || null })}
            aria-invalid={!!errors.meta_title}
          />
          <FieldError message={errors.meta_title} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="seo-meta-description">
            Meta description{" "}
            <span className={cn("font-normal", metaDescLen >= 120 && metaDescLen <= 160 ? "text-emerald-600" : "text-muted-foreground")}>
              ({metaDescLen}/160)
            </span>
          </Label>
          <Textarea
            id="seo-meta-description"
            rows={3}
            maxLength={160}
            value={post.meta_description ?? ""}
            onChange={(e) => onChange({ meta_description: e.target.value || null })}
            aria-invalid={!!errors.meta_description}
          />
          <FieldError message={errors.meta_description} />
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          {Object.entries(checks).map(([key, passed]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              {passed ? (
                <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <CircleX className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className={passed ? "text-foreground" : "text-muted-foreground"}>{CHECK_LABELS[key]}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
