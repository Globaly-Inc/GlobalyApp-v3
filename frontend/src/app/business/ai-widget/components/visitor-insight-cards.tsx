"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/components/feed/utils";
import type { WidgetVisitor } from "../apis/types";

/** `**bold**` from the model as <strong>, everything else as plain text — never as HTML. */
export function Emphasised({ text }: Readonly<{ text: string }>) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
      : part,
  );
}

/**
 * The CONTACT summary: the whole person across every chat — the course they're on, a brief with
 * the key facts in bold, what is still unanswered, and the team's next step. Rewritten from the
 * profile and each chat's own summary right after every chat-summary update and profile edit.
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Built from 2 chats and 6 profile details" — what the summary actually read. */
function builtFrom(summary: WidgetVisitor["summary"]): string {
  const chats = summary?.chat_count ?? 0;
  const details = summary?.detail_count ?? 0;
  // A summary written before the counts existed, or none yet.
  if (!summary?.text || (!chats && !details)) return "Built from the visitor's chats and profile details.";
  const parts = [chats ? plural(chats, "chat") : null, details ? plural(details, "profile detail") : null].filter(Boolean);
  return `Built from ${parts.join(" and ")}.`;
}

export function ContactSummaryCard({ visitor }: Readonly<{ visitor: WidgetVisitor }>) {
  const summary = visitor.summary;
  const program = summary?.program;

  return (
    <Card className="gap-0 border-primary/15 bg-primary/[0.03] py-0">
      <CardHeader className="flex items-center justify-between gap-2 py-4">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          Contact summary
        </CardTitle>
        {summary?.generated_at && (
          <span className="text-xs text-muted-foreground" title={new Date(summary.generated_at).toLocaleString()}>
            {relativeTime(summary.generated_at)}
          </span>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pb-4">
        {summary?.text ? (
          <>
            {program?.name && (
              <span className="w-fit rounded-md border border-primary/25 bg-card px-2 py-0.5 text-xs font-medium text-primary">
                {program.name}{program.city ? ` · ${program.city}` : ""}
              </span>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              <Emphasised text={summary.text} />
            </p>
            {!!summary.open?.length && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Still open:</span>
                {summary.open.map((t) => (
                  <span key={t} className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t}</span>
                ))}
              </div>
            )}
            {summary.next_step && (
              <p className="flex gap-2 rounded-lg border bg-card p-3 text-sm text-foreground">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {summary.next_step}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            The contact summary appears after the visitor&apos;s first real exchange with the assistant.
          </p>
        )}
      </CardContent>
      <CardFooter className="border-t border-primary/10 bg-transparent py-3 text-xs text-muted-foreground">
        {builtFrom(summary)}
      </CardFooter>
    </Card>
  );
}
