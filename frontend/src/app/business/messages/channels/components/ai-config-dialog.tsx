"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ChannelGlyph } from "../../components/channel-glyph";
import { INBOX_CHANNELS } from "../../const";
import type { AiConfig, ChannelConnection } from "../apis/types";
import { CAPABILITY_FIELDS, ESCALATION_FIELDS } from "../const";
import { updateChannelAi } from "../store/channels-slice";

function Check({ checked, onChange, label, hint }: Readonly<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }>) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

const Section = ({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) => (
  <div className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
    {children}
  </div>
);

/** How AI behaves on one connected channel. Applies to new messages. */
export function AiConfigDialog({ connection, onClose }: Readonly<{ connection: ChannelConnection | null; onClose: () => void }>) {
  return (
    <Dialog open={!!connection} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Keyed by connection: the form starts from that connection's saved settings. */}
      {connection && <AiConfigForm key={connection.id} connection={connection} onClose={onClose} />}
    </Dialog>
  );
}

function AiConfigForm({ connection, onClose }: Readonly<{ connection: ChannelConnection; onClose: () => void }>) {
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState(connection.ai_mode);
  const [config, setConfig] = useState<AiConfig>(connection.ai_config);
  const [saving, setSaving] = useState(false);
  const label = INBOX_CHANNELS[connection.channel].label;

  const save = async () => {
    setSaving(true);
    const result = await dispatch(updateChannelAi({ id: connection.id, ai_mode: mode, ai_config: config }));
    setSaving(false);
    if ("error" in result) {
      toast.error("Couldn't save the AI configuration", { description: result.error.message ?? "Please try again." });
      return;
    }
    toast.success(`${label} AI configuration saved`);
    onClose();
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <div className="flex items-center gap-3">
          <ChannelGlyph channel={connection.channel} size="lg" />
          <div className="min-w-0">
            <DialogTitle>{label} · AI configuration</DialogTitle>
            <DialogDescription>{connection.display_name}{connection.handle ? ` · ${connection.handle}` : ""}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <Section title="AI response">
          {([["auto", "Automatically respond", "AI replies to customers right away. Recommended."], ["suggest", "Suggest responses only", "AI drafts a reply and your team sends it."]] as const).map(([value, title, body]) => (
            <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value}
              className={cn("rounded-lg border px-3 py-2 text-left", mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{body}</span>
            </button>
          ))}
        </Section>
        <Section title="AI capabilities">
          {CAPABILITY_FIELDS.map((f) => (
            <Check key={f.key} label={f.label} hint={f.hint} checked={config.capabilities[f.key]}
              onChange={(v) => setConfig((c) => ({ ...c, capabilities: { ...c.capabilities, [f.key]: v } }))} />
          ))}
        </Section>
        <Section title="Human takeover">
          <Check label="Allow business users to take over" hint="AI pauses while a person handles the conversation" checked={config.takeover}
            onChange={(v) => setConfig((c) => ({ ...c, takeover: v }))} />
        </Section>
        <Section title="Escalation conditions">
          {ESCALATION_FIELDS.map((f) => (
            <Check key={f.key} label={f.label} hint={f.hint} checked={config.escalation[f.key]}
              onChange={(v) => setConfig((c) => ({ ...c, escalation: { ...c.escalation, [f.key]: v } }))} />
          ))}
        </Section>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Save configuration
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
