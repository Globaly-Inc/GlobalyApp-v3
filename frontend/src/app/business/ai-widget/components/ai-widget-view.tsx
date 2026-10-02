"use client";

import { useEffect, useRef } from "react";
import { Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import {
  fetchEmbedConfigs, rotateEmbedKey,
} from "../store/ai-widget-slice";
import { WidgetCard } from "./widget-card";
import { WidgetEditor } from "./widget-editor-view";

/**
 * The org's one widget. Before it exists: the editor in create mode. After: the embed code,
 * usage and key controls, with the same editor below for its appearance and settings. There is
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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Bot className="size-5" /> AI Widget
        </h1>
        <p className="text-sm text-muted-foreground">
          Embed a branded AI counsellor on your website, scoped to your courses.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "loading" && !config ? (
        <Skeleton className="h-96 w-full" />
      ) : config ? (
        <>
          <WidgetCard
            config={config}
            onRotateKey={(id) => dispatch(rotateEmbedKey(id))}
          />
          {/* Keyed so a saved change re-seeds the form from what the server now holds. */}
          <WidgetEditor key={`${config.id}-${config.updated_at}`} initial={config} />
        </>
      ) : status !== "failed" ? (
        <WidgetEditor />
      ) : null}
    </div>
  );
}
