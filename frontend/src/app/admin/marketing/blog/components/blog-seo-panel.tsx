"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
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
      <CardHeader>
        <CardTitle>SEO</CardTitle>
        <CardAction>
          <span className={cn("font-heading text-2xl font-medium tabular-nums", scoreColor(score))}>{score}</span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField label="Focus keyword" htmlFor="seo-focus-keyword" error={errors.focus_keyword}>
          <Input
            id="seo-focus-keyword"
            className="h-9"
            value={post.focus_keyword ?? ""}
            onChange={(e) => onChange({ focus_keyword: e.target.value || null })}
            aria-invalid={!!errors.focus_keyword}
          />
        </FormField>

        <FormField
          label={<>Meta title <span className="font-normal text-muted-foreground">({metaTitleLen}/60)</span></>}
          htmlFor="seo-meta-title"
          error={errors.meta_title}
        >
          <Input
            id="seo-meta-title"
            className="h-9"
            maxLength={60}
            value={post.meta_title ?? ""}
            onChange={(e) => onChange({ meta_title: e.target.value || null })}
            aria-invalid={!!errors.meta_title}
          />
        </FormField>

        <FormField
          label={
            <>
              Meta description{" "}
              <span className={cn("font-normal", metaDescLen >= 120 && metaDescLen <= 160 ? "text-success" : "text-muted-foreground")}>
                ({metaDescLen}/160)
              </span>
            </>
          }
          htmlFor="seo-meta-description"
          error={errors.meta_description}
        >
          <Textarea
            id="seo-meta-description"
            rows={3}
            maxLength={160}
            value={post.meta_description ?? ""}
            onChange={(e) => onChange({ meta_description: e.target.value || null })}
            aria-invalid={!!errors.meta_description}
          />
        </FormField>

        <ul className="flex flex-col gap-1.5 border-t border-border pt-4">
          {Object.entries(checks).map(([key, passed]) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              {passed ? (
                <CircleCheck className="h-4 w-4 shrink-0 text-success" />
              ) : (
                <CircleX className="h-4 w-4 shrink-0 text-destructive" />
              )}
              <span className={passed ? "text-foreground" : "text-muted-foreground"}>{CHECK_LABELS[key]}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
