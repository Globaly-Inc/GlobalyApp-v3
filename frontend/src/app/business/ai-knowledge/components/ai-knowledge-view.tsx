"use client";

import { useState } from "react";
import { Brain, Lock } from "lucide-react";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { isInstitutionContext } from "@/lib/api/http";
import { KNOWLEDGE_TABS } from "../const";
import type { KnowledgeTab } from "../types";
import { MemoriesTab } from "./memories-tab";
import { ConversationsTab } from "./conversations-tab";
import { StyleTab } from "./style-tab";

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
  const [tab, setTab] = useState<KnowledgeTab>("style");

  if (!isInstitutionContext()) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
        <Lock className="size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">AI knowledge is available for institutions</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Your widget answers from your own courses and website. Teaching it how to counsel —
          and reviewing what it has learned — is being rolled out to institution accounts first.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Brain className="size-5" /> AI knowledge
        </h1>
        <p className="text-sm text-muted-foreground">
          How your counsellor answers — the rules you set, and what it has picked up from real
          conversations. Nothing it learns goes into use until it is reviewed.
        </p>
      </div>

      <AdminSegmentedTabs
        options={KNOWLEDGE_TABS}
        value={tab}
        onChange={(next) => setTab(next)}
        className="mb-0"
      />

      {tab === "style" && <StyleTab />}
      {tab === "memories" && <MemoriesTab />}
      {tab === "conversations" && <ConversationsTab />}
    </div>
  );
}
