"use client";

import { useState } from "react";
import { HelpCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { aiKnowledgeApi } from "../apis";
import type { Faq, FaqParams } from "../apis/types";
import { useConfirmDelete } from "./use-confirm-delete";
import { EmptyState, ListSkeleton } from "./shared";

function FaqForm({
  faq, saving, onCancel, onSave,
}: Readonly<{ faq?: Faq; saving: boolean; onCancel: () => void; onSave: (v: FaqParams) => void }>) {
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [tags, setTags] = useState((faq?.tags ?? []).join(", "));
  const [active, setActive] = useState(faq?.active ?? true);

  const submit = () => {
    if (!question.trim() || !answer.trim()) {
      toast.error("Question and answer are both required");
      return;
    }
    const parsed = tags.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ question: question.trim(), answer: answer.trim(), tags: parsed.length ? parsed : null, active });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <p className="font-semibold text-foreground">{faq ? "Edit FAQ" : "New FAQ"}</p>

        <div className="flex flex-col gap-1.5">
          <Label>Question *</Label>
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How many hours can I work?" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Answer *</Label>
          {/* The shared Textarea is field-sizing-content, so it needs explicit rows. */}
          <Textarea rows={5} className="min-h-28" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tags</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work-rights, australia" />
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} />
          Active
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="gap-1.5 cursor-pointer" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button className="cursor-pointer" disabled={saving} onClick={submit}>
            {faq ? "Save changes" : "Create FAQ"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FaqsTab({
  faqs, loading, onReload,
}: Readonly<{ faqs: Faq[]; loading: boolean; onReload: () => void }>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirmDelete();

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      onReload();
    } catch (e) {
      toast.error("Action failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {dialog}

      <div className="flex justify-end">
        <Button className="gap-1.5 cursor-pointer" disabled={adding} onClick={() => { setAdding(true); setEditingId(null); }}>
          <Plus className="h-4 w-4" />
          Add FAQ
        </Button>
      </div>

      {adding && (
        <FaqForm
          saving={saving}
          onCancel={() => setAdding(false)}
          onSave={(values) => run(async () => { await aiKnowledgeApi.createFaq(values); setAdding(false); }, "FAQ created")}
        />
      )}

      {loading && <ListSkeleton />}

      {!loading && faqs.length === 0 && !adding && (
        <EmptyState icon={HelpCircle} title="No FAQs yet" hint="Add the questions students ask most often." />
      )}

      {faqs.map((faq) =>
        editingId === faq.id ? (
          <FaqForm
            key={faq.id}
            faq={faq}
            saving={saving}
            onCancel={() => setEditingId(null)}
            onSave={(values) => run(async () => { await aiKnowledgeApi.updateFaq(faq.id, values); setEditingId(null); }, "FAQ updated")}
          />
        ) : (
          <Card key={faq.id}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{faq.question}</p>
                  {!faq.active && <Badge className="bg-muted text-xs text-muted-foreground">Inactive</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{faq.answer}</p>
                {(faq.tags?.length ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {faq.tags!.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" className="cursor-pointer" title="Edit" onClick={() => { setEditingId(faq.id); setAdding(false); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" title="Delete"
                  className="cursor-pointer text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (!(await confirm("Delete this FAQ?"))) return;
                    run(() => aiKnowledgeApi.deleteFaq(faq.id), "FAQ deleted");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}
