"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { createEmbedConfig, deactivateEmbedConfig, fetchEmbedConfigs } from "../store/ai-widget-slice";
import type { CreateEmbedConfigInput } from "../apis/types";
import { CreateWidgetDialog } from "./create-widget-dialog";
import { WidgetCard } from "./widget-card";

export function AiWidgetView() {
  const dispatch = useAppDispatch();
  const { configs, status, createStatus, error } = useAppSelector((s) => s.aiWidget);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEmbedConfigs());
  }, [dispatch]);

  const handleCreate = async (input: CreateEmbedConfigInput): Promise<boolean> => {
    const result = await dispatch(createEmbedConfig(input));
    return createEmbedConfig.fulfilled.match(result);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bot className="size-5" /> AI Widget
          </h1>
          <p className="text-sm text-muted-foreground">
            Embed a branded AI counsellor on your website, scoped to your courses.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" /> New widget
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "loading" && configs.length === 0 ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No widgets yet. Create one to get your embed code.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {configs.map((c) => (
            <WidgetCard key={c.id} config={c} onDeactivate={(id) => dispatch(deactivateEmbedConfig(id))} />
          ))}
        </div>
      )}

      <CreateWidgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreate}
        creating={createStatus === "loading"}
      />
    </div>
  );
}
