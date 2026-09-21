"use client";

import { useState } from "react";
import { Plus, Save, Star, StarOff, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { FilterConditionRow } from "./filter-condition-row";
import type { FilterFieldDefinition, FilterLogic } from "./types";
import type { UniversalFilter } from "@/lib/use-universal-filter";

const MATCH_OPTIONS = [
  { value: "and", label: "ALL" },
  { value: "or", label: "ANY" },
];
const JOIN_OPTIONS = [
  { value: "and", label: "AND" },
  { value: "or", label: "OR" },
];

/** The popover body behind the Filter button: saved filters, then the group/condition tree. */
export function UniversalFilterPanel({
  filter,
  fieldDefinitions,
}: Readonly<{ filter: UniversalFilter; fieldDefinitions: FilterFieldDefinition[] }>) {
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);

  const handleSave = () => {
    const name = saveName.trim();
    if (!name) return;
    filter.saveFilter(name);
    setSaveName("");
    setShowSave(false);
  };

  return (
    <div className="min-w-[480px] max-w-[640px] space-y-4 p-4">
      {filter.savedFilters.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Saved filters</p>
          <div className="flex flex-wrap gap-1.5">
            {filter.savedFilters.map((saved) => (
              <div key={saved.id} className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className="cursor-pointer text-xs hover:bg-accent"
                  onClick={() => filter.applySavedFilter(saved)}
                >
                  {saved.name}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={filter.defaultFilterId === saved.id ? "Unset as default" : "Set as default"}
                  onClick={() => filter.setDefaultFilter(filter.defaultFilterId === saved.id ? null : saved.id)}
                >
                  {filter.defaultFilterId === saved.id ? (
                    <Star className="h-3 w-3 fill-primary text-primary" />
                  ) : (
                    <StarOff className="h-3 w-3 text-muted-foreground" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-destructive"
                  aria-label={`Delete ${saved.name}`}
                  onClick={() => filter.deleteFilter(saved.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <Separator />
        </div>
      )}

      {filter.filterConfig.groups.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Match</span>
          <Combobox
            className="h-8 w-24 text-xs"
            options={MATCH_OPTIONS}
            value={filter.filterConfig.logic}
            onChange={(v) => v && filter.setTopLogic(v as FilterLogic)}
          />
          <span className="text-xs text-muted-foreground">groups</span>
        </div>
      )}

      {filter.filterConfig.groups.map((group, index) => (
        <div key={group.id} className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {group.conditions.length > 1 && (
                <Combobox
                  className="h-8 w-20 text-xs"
                  options={JOIN_OPTIONS}
                  value={group.logic}
                  onChange={(v) => v && filter.setGroupLogic(group.id, v as FilterLogic)}
                />
              )}
              <span className="text-xs text-muted-foreground">Group {index + 1}</span>
            </div>
            <Button variant="ghost" size="icon-xs" aria-label={`Remove group ${index + 1}`} onClick={() => filter.removeGroup(group.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {group.conditions.map((condition) => (
            <FilterConditionRow
              key={condition.id}
              condition={condition}
              fieldDefinitions={fieldDefinitions}
              onUpdate={(updates) => filter.updateCondition(group.id, condition.id, updates)}
              onRemove={() => filter.removeCondition(group.id, condition.id)}
            />
          ))}
          <Button variant="ghost" size="sm" onClick={() => filter.addCondition(group.id)}>
            <Plus className="h-3 w-3" /> Add condition
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={filter.addGroup}>
          <Plus className="h-3 w-3" /> Add filter group
        </Button>
        {filter.filterConfig.groups.length > 0 && (
          <>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={filter.clearFilters}>
              Clear all
            </Button>
            {showSave ? (
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-8 w-36 text-xs"
                  placeholder="Filter name..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                />
                <Button size="sm" onClick={handleSave} disabled={!saveName.trim()}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowSave(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowSave(true)}>
                <Save className="h-3 w-3" /> Save filter
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
