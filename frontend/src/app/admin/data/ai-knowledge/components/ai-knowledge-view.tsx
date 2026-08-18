"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchCategories, fetchCounts, fetchDocuments, fetchEmbeddingStatus, fetchFaqs,
  fetchGuides, fetchQueue, fetchRackCounts, fetchSources, fetchVisas,
} from "../store/ai-knowledge-slice";
import { KNOWLEDGE_TABS } from "../const";
import type { KnowledgeTab } from "../types";
import { EmbeddingStatusBanner } from "./embedding-status-banner";
import { FaqsTab } from "./faqs-tab";
import { GuidesTab } from "./guides-tab";
import { QueueTab } from "./queue-tab";
import { RackTab } from "./rack-tab";
import { VisaTab } from "./visa-tab";

export function AiKnowledgeView() {
  const dispatch = useAppDispatch();
  const {
    counts, rackCounts, embeddingStatus, visas, faqs, guides, queue, categories,
    sources, documents, status,
  } = useAppSelector((state) => state.dataAiKnowledge);

  const [tab, setTab] = useState<KnowledgeTab>("rack");
  const [search, setSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchCounts());
    dispatch(fetchRackCounts());
    dispatch(fetchEmbeddingStatus());
    dispatch(fetchCategories());
  }, [dispatch]);

  // Search is server-side, so debounce it rather than firing on every keystroke.
  useEffect(() => {
    const q = search.trim() || undefined;
    const timer = setTimeout(() => {
      if (tab === "visa") dispatch(fetchVisas(q));
      if (tab === "faqs") dispatch(fetchFaqs(q));
      if (tab === "guides") dispatch(fetchGuides(q));
    }, 300);
    return () => clearTimeout(timer);
  }, [dispatch, tab, search]);

  useEffect(() => {
    if (tab === "queue") dispatch(fetchQueue(queueStatus || undefined));
  }, [dispatch, tab, queueStatus]);

  // Derived, not stored: falling back to the first category keeps the rack from
  // being a dead end without an effect writing state during render.
  const activeCategoryId = categoryId ?? categories[0]?.id ?? null;

  useEffect(() => {
    if (activeCategoryId) dispatch(fetchSources({ categoryId: activeCategoryId }));
  }, [dispatch, activeCategoryId]);

  const reloadCounts = useCallback(() => {
    dispatch(fetchCounts());
    dispatch(fetchRackCounts());
  }, [dispatch]);

  const reloadSources = useCallback((id: string) => {
    dispatch(fetchSources({ categoryId: id }));
    dispatch(fetchRackCounts());
    // A crawl adds documents, which adds pending chunks — keep the banner honest.
    dispatch(fetchEmbeddingStatus());
  }, [dispatch]);

  const reloadEmbeddingStatus = useCallback(() => {
    dispatch(fetchEmbeddingStatus());
  }, [dispatch]);

  const reloadDocuments = useCallback((sourceId: string) => {
    dispatch(fetchDocuments({ sourceId }));
  }, [dispatch]);

  const q = search.trim() || undefined;
  const reload = {
    visa: () => { dispatch(fetchVisas(q)); reloadCounts(); },
    faqs: () => { dispatch(fetchFaqs(q)); reloadCounts(); },
    guides: () => { dispatch(fetchGuides(q)); reloadCounts(); },
    queue: () => { dispatch(fetchQueue(queueStatus || undefined)); reloadCounts(); },
  };

  const stats = [
    { key: "visa" as const, label: "Visa entries", value: counts?.visa ?? 0 },
    { key: "faqs" as const, label: "FAQs", value: counts?.faqs ?? 0 },
    { key: "guides" as const, label: "Country guides", value: counts?.guides ?? 0 },
    { key: "queue" as const, label: "Pending reviews", value: counts?.pending_reviews ?? 0 },
  ];

  const loading = status === "loading";
  const showSearch = tab === "visa" || tab === "faqs" || tab === "guides";

  return (
    <div className="pb-12">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Knowledge</h1>
        <p className="mt-1 text-muted-foreground">Manage the data that powers the Globaly AI counsellor.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <button
            key={stat.key}
            type="button"
            onClick={() => setTab(stat.key)}
            className={cn(
              "cursor-pointer rounded-lg border p-3 text-left transition-colors",
              tab === stat.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
            )}
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-semibold">{stat.value}</p>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full overflow-x-auto border-b border-border md:w-auto">
          <div className="inline-flex w-max gap-1 pb-px">
            {KNOWLEDGE_TABS.map((entry) => (
              <button
                key={entry.value}
                type="button"
                onClick={() => setTab(entry.value)}
                className={cn(
                  "-mb-px flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === entry.value
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <entry.icon className="h-3.5 w-3.5" />
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        {showSearch && (
          <div className="relative w-full md:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
        )}
      </div>

      {tab === "rack" && (
        <>
          <EmbeddingStatusBanner status={embeddingStatus} onRefresh={reloadEmbeddingStatus} />
          {rackCounts && (
            <p className="mb-3 text-xs text-muted-foreground">
              {rackCounts.categories} categories · {rackCounts.sources} sources · {rackCounts.documents} documents ·{" "}
              {rackCounts.embedded_documents} embedded
            </p>
          )}
          <RackTab
            categories={categories}
            sources={sources}
            documents={documents}
            loading={loading}
            selectedCategoryId={activeCategoryId}
            onSelectCategory={setCategoryId}
            onReloadCategories={() => { dispatch(fetchCategories()); reloadCounts(); }}
            onReloadSources={reloadSources}
            onReloadDocuments={reloadDocuments}
          />
        </>
      )}

      {tab === "visa" && <VisaTab entries={visas} loading={loading} onReload={reload.visa} />}
      {tab === "faqs" && <FaqsTab faqs={faqs} loading={loading} onReload={reload.faqs} />}
      {tab === "guides" && <GuidesTab guides={guides} loading={loading} onReload={reload.guides} />}
      {tab === "queue" && (
        <QueueTab
          items={queue}
          loading={loading}
          status={queueStatus}
          onStatusChange={setQueueStatus}
          onReload={reload.queue}
        />
      )}
    </div>
  );
}
