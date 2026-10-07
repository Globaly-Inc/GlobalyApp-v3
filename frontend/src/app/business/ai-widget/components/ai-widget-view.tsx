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

  const heading = (
    <div className="flex items-center gap-3">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Bot className="size-5" aria-hidden />
      </span>
      <div>
        <h1 className="text-2xl font-semibold">AI Widget</h1>
        <p className="text-sm text-muted-foreground">
          Embed a branded AI counsellor on your website, scoped to your courses.
        </p>
      </div>
    </div>
  );

  // The editor draws the heading itself, so the Create/Save buttons can sit on the same row.
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "loading" && !config ? (
        <>
          {heading}
          <Skeleton className="h-96 w-full" />
        </>
      ) : config ? (
        // Keyed so a saved change re-seeds the form from what the server now holds.
        <WidgetEditor
          key={`${config.id}-${config.updated_at}`}
          initial={config}
          heading={heading}
          card={<WidgetCard config={config} onRotateKey={(id) => dispatch(rotateEmbedKey(id))} />}
        />
      ) : status !== "failed" ? (
        <WidgetEditor heading={heading} />
      ) : (
        heading
      )}
    </div>
  );
}
