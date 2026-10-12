"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { visitorDisplayName } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { channelsApi, type WhatsAppTemplate } from "../channels/apis";
import { sendEmbedTemplate } from "../store/embed-chats-slice";

/** A template's body with {{1}} filled with the customer's first name — what they will read. */
function preview(t: WhatsAppTemplate, firstName: string): string {
  const body = (t.components as { type?: string; text?: string }[]).find((c) => c.type?.toUpperCase() === "BODY")?.text ?? t.name;
  return body.replace(/\{\{1\}\}/g, firstName);
}

/** WhatsApp after its 24-hour window: only a template Meta has approved can be sent. */
export function TemplatePickerDialog({
  visitor, open, onOpenChange,
}: Readonly<{ visitor: WidgetVisitor; open: boolean; onOpenChange: (open: boolean) => void }>) {
  const dispatch = useAppDispatch();
  const [templates, setTemplates] = useState<WhatsAppTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState(0);
  const [sending, setSending] = useState(false);
  const firstName = visitorDisplayName(visitor).split(" ")[0] ?? "";
  const connectionId = visitor.channel_connection_id;

  useEffect(() => {
    if (!open || connectionId == null) return;
    let live = true;
    channelsApi.listTemplates(connectionId).then(
      (rows) => { if (live) { setTemplates(rows); setFailed(false); } },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [open, connectionId]);

  const chosen = templates?.[picked];
  const send = async () => {
    if (!chosen) return;
    setSending(true);
    const result = await dispatch(sendEmbedTemplate({ visitorId: visitor.id, template: { name: chosen.name, language: chosen.language, preview: preview(chosen, firstName) } }));
    setSending(false);
    if ("error" in result) {
      toast.error("Couldn't send the template", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success("Template sent");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a template</DialogTitle>
          <DialogDescription>
            {firstName}&apos;s 24-hour window has closed. WhatsApp only allows templates Meta has approved until they reply.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">Couldn&apos;t load templates. Close and try again.</p>
        ) : !templates ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-primary" aria-hidden /></div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">This number has no approved templates yet. Create one in WhatsApp Manager.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t, i) => (
              <button
                key={`${t.name}-${t.language}`}
                type="button"
                onClick={() => setPicked(i)}
                aria-pressed={picked === i}
                className={cn("rounded-lg border px-3 py-2 text-left", picked === i ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
              >
                <span className="block font-mono text-xs font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.language}{t.category ? ` · ${t.category.toLowerCase()}` : ""}</span>
              </button>
            ))}
            {chosen && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{preview(chosen, firstName)}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!chosen || sending}>
            {sending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            Send template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
