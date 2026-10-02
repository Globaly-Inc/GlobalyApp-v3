"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { isInstitutionContext } from "@/lib/api/http";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchMemorySummary } from "../store/ai-knowledge-slice";
import { fetchConversations } from "../store/ai-knowledge-reviews-slice";
import { fetchConversionInsights } from "../store/ai-knowledge-insights-slice";
import type { KnowledgeTab } from "../types";
import { KnowledgeHeader } from "./knowledge-header";
import { KnowledgeNav } from "./knowledge-nav";
import { MemoriesTab } from "./memories-tab";
import { ConversationsTab } from "./conversations-tab";
import { StyleTab } from "./style-tab";
import { InsightsTab } from "./insights-tab";

/**
 * What this institution's AI counsellor knows, and where its replies get corrected.
 *
 * Everything here is scoped by the token's institution — the endpoints sit behind
 * `requireInstitutionContext` and read a table in the institution's own schema, so there is no
 * org id for this page to pass and none it could change.
 *
 * Businesses are gated out in front rather than left to collect a 403: a business widget has no
 * memory layer at all on the backend, so the honest answer is a sentence, not an error.
 */
export function AiKnowledgeView() {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<KnowledgeTab>("style");

  const summary = useAppSelector((s) => s.aiKnowledge.summary);
  const sessions = useAppSelector((s) => s.aiKnowledgeReviews.sessions);
  const insights = useAppSelector((s) => s.aiKnowledgeInsights.insights);

  /**
   * The header's three reads, fired once on mount rather than when their tab is opened — the
   * whole point of the panel is to tell you what needs you BEFORE you go looking for it, so
   * these cannot wait for the click they exist to save.
   *
   * Ref-guarded per frontend/AGENTS.md: Strict Mode double-invokes this in dev, and three
   * duplicated requests on every mount is the bug that guard exists for.
   */
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !isInstitutionContext()) return;
    fetchedRef.current = true;
    dispatch(fetchMemorySummary());
    dispatch(fetchConversations({ unreviewed: true }));
    dispatch(fetchConversionInsights());
  }, [dispatch]);

  if (!isInstitutionContext()) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Lock className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">AI knowledge is for institution accounts</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Your widget still answers from your own courses and website — that part works exactly
          the same. What this page adds on top, setting how your assistant counsels and reviewing
          what it has picked up, is built for institution accounts. Talk to us if you need it.
        </p>
      </div>
    );
  }

  // Replies awaiting a look, from the unreviewed queue the header already fetched. Summed over
  // sessions rather than counted as sessions: two unreviewed replies in one conversation are two
  // decisions, and the header's figure is a count of decisions.
  const unreviewedReplies = sessions.reduce((n, s) => n + s.unreviewed, 0);

  const conversionRate = insights && insights.conversations > 0
    ? Math.round((insights.converted / insights.conversations) * 100)
    : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <KnowledgeHeader
        summary={summary}
        unreviewedReplies={unreviewedReplies}
        conversionRate={conversionRate}
        onJump={setTab}
      />

      <KnowledgeNav
        value={tab}
        onChange={setTab}
        counts={{ memories: summary?.needsYou ?? 0, conversations: unreviewedReplies }}
      />

      {tab === "style" && <StyleTab />}
      {tab === "memories" && <MemoriesTab />}
      {tab === "conversations" && <ConversationsTab />}
      {tab === "insights" && <InsightsTab />}
    </div>
  );
}
