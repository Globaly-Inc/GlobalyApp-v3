"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/scroll-row";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchCategories, fetchCounts, fetchDocuments, fetchFaqs, fetchGuides,
  fetchQueue, fetchRackCounts, fetchSources, fetchVisas,
} from "../store/ai-knowledge-slice";
import { KNOWLEDGE_TABS, RACK_KIND_TABS } from "../const";
import type { CategoryKind } from "../apis/types";
import type { KnowledgeTab } from "../types";
import { FaqsTab } from "./faqs-tab";
import { GuidesTab } from "./guides-tab";
import { QueueTab } from "./queue-tab";
import { RackTab } from "./rack-tab";
import { VisaTab } from "./visa-tab";

export function AiKnowledgeView() {
  const dispatch = useAppDispatch();
  const {
    counts, rackCounts, visas, faqs, guides, queue, categories, sources, documents, status,
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

  // Kind tabs are the rack filtered to one category kind; "rack" shows everything.
  const rackKind = RACK_KIND_TABS.includes(tab as CategoryKind) ? (tab as CategoryKind) : null;
  const isRackView = tab === "rack" || rackKind !== null;
  const visibleCategories = rackKind ? categories.filter((c) => c.kind === rackKind) : categories;

  // Derived, not stored: falling back to the first visible category keeps the rack from
  // being a dead end without an effect writing state during render, and switching kind
  // tabs never leaves a category from another kind selected.
  const activeCategoryId =
    (categoryId && visibleCategories.some((c) => c.id === categoryId) ? categoryId : visibleCategories[0]?.id) ?? null;

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

  const stats: { key: KnowledgeTab; label: string; value: number }[] = [
    { key: "visa", label: "Visa entries", value: counts?.visa ?? 0 },
    { key: "faqs", label: "FAQs", value: counts?.faqs ?? 0 },
    { key: "guides", label: "Country guides", value: counts?.guides ?? 0 },
    { key: "gov_update", label: "Gov update sources", value: counts?.sources_by_kind?.gov_update ?? 0 },
    { key: "institution_update", label: "Institution sources", value: counts?.sources_by_kind?.institution_update ?? 0 },
    { key: "scholarship", label: "Scholarship sources", value: counts?.sources_by_kind?.scholarship ?? 0 },
    { key: "test_provider", label: "Test provider sources", value: counts?.sources_by_kind?.test_provider ?? 0 },
    { key: "other", label: "Other sources", value: counts?.sources_by_kind?.other ?? 0 },
    { key: "queue", label: "Pending reviews", value: counts?.pending_reviews ?? 0 },
  ];

  const loading = status === "loading";
  const showSearch = tab === "visa" || tab === "faqs" || tab === "guides";

  return (
    <div className="pb-12">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">AI Knowledge</h1>
        <p className="mt-1 text-muted-foreground">Manage the data that powers the Globaly AI counsellor.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
        <ScrollRow className="w-full border-b border-border md:w-auto">
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
        </ScrollRow>

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

      {isRackView && (
        <>
          {tab === "rack" && rackCounts && (
            <p className="mb-3 text-xs text-muted-foreground">
              {rackCounts.categories} categories · {rackCounts.sources} sources · {rackCounts.documents} documents ·{" "}
              {rackCounts.embedded_documents} retrievable · {rackCounts.embedded_chunks} chunks in brain
            </p>
          )}
          <RackTab
            categories={visibleCategories}
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
