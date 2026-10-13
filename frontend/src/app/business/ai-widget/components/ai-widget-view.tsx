"use client";

import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchEmbedConfigs, rotateEmbedKey,
} from "../store/ai-widget-slice";
import { WidgetCard } from "./widget-card";
import { WidgetEditor } from "./widget-editor-view";

/**
 * The org's one widget. Before it exists: the editor in create mode. After: the same editor, with
 * the embed code and key controls across the top of its settings. There is
 * no "New widget" — one per business or institution, which the backend enforces too.
 */
export function AiWidgetView() {
  const dispatch = useAppDispatch();
  const { configs, status, error } = useAppSelector((s) => s.aiWidget);
  const [config] = configs;

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEmbedConfigs());
  }, [dispatch]);

  // The header stays put through loading, create and edit; the editor below it owns the save row.
  return (
    <PageBody className="w-full">
      <PageHeader
        title={<><Bot className="text-primary" aria-hidden /> AI Widget</>}
        subtitle="Embed a branded AI counsellor on your website, scoped to your courses."
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "loading" && !config ? (
        <Skeleton className="h-96 w-full" />
      ) : config ? (
        // Keyed so a saved change re-seeds the form from what the server now holds.
        <WidgetEditor
          key={`${config.id}-${config.updated_at}`}
          initial={config}
          card={<WidgetCard config={config} onRotateKey={(id) => dispatch(rotateEmbedKey(id))} />}
        />
      ) : status !== "failed" ? (
        <WidgetEditor />
      ) : null}
    </PageBody>
  );
}
