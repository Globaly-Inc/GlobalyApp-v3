"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/combobox";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { DIFFICULTY_OPTIONS } from "../const";
import { removeKeyword, saveKeyword } from "../store/blog-slice";
import type { KeywordDifficulty } from "../apis/types";

const DIFFICULTY_VARIANT: Record<KeywordDifficulty, "default" | "secondary" | "destructive"> = {
  easy: "secondary",
  medium: "default",
  hard: "destructive",
};

export function BlogKeywordsManager() {
  const dispatch = useAppDispatch();
  const keywords = useAppSelector((state) => state.marketingBlog.keywords);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState<KeywordDifficulty>("medium");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!keyword.trim()) return;
    setSaving(true);
    const result = await dispatch(
      saveKeyword({ id: null, input: { keyword: keyword.trim(), category: category.trim() || null, difficulty, is_active: true } }),
    );
    setSaving(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    setKeyword("");
    setCategory("");
    toast.success("Keyword added");
  };

  const handleToggleActive = (id: number, is_active: boolean) => {
    void dispatch(saveKeyword({ id, input: { is_active } }));
  };

  const handleDelete = async (id: number) => {
    const result = await dispatch(removeKeyword(id));
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    toast.success("Keyword deleted");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{keywords.length} keywords</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input
            placeholder="Keyword"
            className="h-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            placeholder="Category (optional)"
            className="h-9"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Combobox
            value={difficulty}
            onChange={(v) => setDifficulty(v as KeywordDifficulty)}
            options={DIFFICULTY_OPTIONS}
            placeholder="Difficulty"
          />
          <Button className="h-9 gap-1.5" onClick={handleAdd} disabled={saving || !keyword.trim()}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        <div className="divide-y divide-border rounded-md border border-border">
          {keywords.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No keywords yet.</p>}
          {keywords.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{k.keyword}</span>
              {k.category && <span className="hidden text-xs text-muted-foreground sm:inline">{k.category}</span>}
              {k.difficulty && <Badge variant={DIFFICULTY_VARIANT[k.difficulty]}>{k.difficulty}</Badge>}
              <Switch checked={k.is_active} onCheckedChange={(checked) => handleToggleActive(k.id, checked)} />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(k.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
