"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { visitorDisplayName } from "@/app/business/ai-widget/utils";
import type { WidgetVisitor } from "@/app/business/ai-widget/apis/types";
import { channelsApi, type WhatsAppTemplate } from "../channels/apis";
import { sendEmbedTemplate } from "../store/embed-chats-slice";

const bodyOf = (t: WhatsAppTemplate) =>
  ((t.components ?? []) as { type?: string; text?: string }[]).find((c) => c.type?.toUpperCase() === "BODY")?.text ?? t.name;

/** The body's numbered variables, in order: "Hi {{1}}, your {{2}}…" → [1, 2]. */
const variablesOf = (t: WhatsAppTemplate) =>
  [...new Set([...bodyOf(t).matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);

/** The body with every variable filled — exactly what the customer will read. */
const preview = (t: WhatsAppTemplate, values: Record<number, string>) =>
  bodyOf(t).replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n)] || `{{${n}}}`);

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
  // {{1}} starts as the customer's first name; every variable is editable, and all are sent to
  // Meta (not only shown here), so the message delivered matches this preview.
  const [edited, setEdited] = useState<Record<number, string>>({});
  const vars = chosen ? variablesOf(chosen) : [];
  const values: Record<number, string> = { 1: firstName, ...edited };
  const missing = vars.some((n) => !values[n]?.trim());
  const pick = (i: number) => { setPicked(i); setEdited({}); };
  const send = async () => {
    if (!chosen || missing) return;
    setSending(true);
    const result = await dispatch(sendEmbedTemplate({
      visitorId: visitor.id,
      template: { name: chosen.name, language: chosen.language, preview: preview(chosen, values), params: vars.map((n) => values[n]!.trim()) },
    }));
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
                onClick={() => pick(i)}
                aria-pressed={picked === i}
                className={cn("rounded-lg border px-3 py-2 text-left", picked === i ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}
              >
                <span className="block font-mono text-xs font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.language}{t.category ? ` · ${t.category.toLowerCase()}` : ""}</span>
              </button>
            ))}
            {vars.map((n) => (
              <label key={n} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-10 shrink-0 font-mono">{`{{${n}}}`}</span>
                <Input value={values[n] ?? ""} onChange={(e) => setEdited((v) => ({ ...v, [n]: e.target.value }))} placeholder="Value for this variable" />
              </label>
            ))}
            {chosen && <p className="whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm">{preview(chosen, values)}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={send} disabled={!chosen || missing || sending}>
            {sending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
            Send template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
