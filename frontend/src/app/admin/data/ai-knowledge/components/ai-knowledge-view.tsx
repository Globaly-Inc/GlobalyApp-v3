"use client";

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminRecordsCard } from "../../../components/admin-placeholder-view";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { fetchKnowledge } from "../store/ai-knowledge-slice";
import { KNOWLEDGE_TABS, KNOWLEDGE_COLUMNS } from "../const";
import type { KnowledgeTab } from "../types";

export function AiKnowledgeView() {
  const dispatch = useAppDispatch();
  const { data } = useAppSelector((state) => state.dataAiKnowledge);
  const [tab, setTab] = useState<KnowledgeTab>("rack");

  useEffect(() => {
    dispatch(fetchKnowledge());
  }, [dispatch]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Knowledge</h1>
        <p className="text-muted-foreground mt-1">Manage the AI counselor&apos;s knowledge base.</p>
      </div>

      <AdminSegmentedTabs options={KNOWLEDGE_TABS} value={tab} onChange={setTab} />

      <AdminRecordsCard columns={KNOWLEDGE_COLUMNS[tab]} rows={data?.[tab] ?? []} />
    </div>
  );
}
