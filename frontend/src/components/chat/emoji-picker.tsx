"use client";

import { useMemo, useState } from "react";
import { Cat, Clock, Coffee, Hand, Heart, Lightbulb, PartyPopper, Search, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  EMOJI_CATEGORIES,
  QUICK_EMOJIS,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from "./emojis";

/**
 * The composer's emoji picker — GlobalyOS V2's `components/ui/EmojiPicker`: a quick row,
 * a search field, category tabs, and a recently-used section persisted to localStorage.
 *
 * V2 builds its tabs from shadcn `Tabs` and scrolls with `ScrollArea`; neither exists in
 * this project's UI kit, so the tab strip is a row of icon buttons and the grid is a
 * plain `overflow-y-auto` box. Same layout, same behaviour, no new dependency.
 */
const CATEGORY_ICONS: Record<string, typeof Smile> = {
  smileys: Smile,
  gestures: Hand,
  hearts: Heart,
  celebrations: PartyPopper,
  objects: Lightbulb,
  animals: Cat,
  food: Coffee,
};

/** `recent` is a pseudo-category, first in the strip, exactly as in V2. */
const RECENT_KEY = "recent";

function EmojiGrid({ emojis, onPick }: Readonly<{ emojis: readonly string[]; onPick: (emoji: string) => void }>) {
  if (emojis.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No emoji found</p>;
  }
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((emoji, i) => (
        <button
          key={`${emoji}-${i}`}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({
  onSelect,
  trigger,
  side = "top",
  align = "start",
  closeOnSelect = false,
}: Readonly<{
  onSelect: (emoji: string) => void;
  /** Defaults to the composer's smiley button; reactions pass their own. */
  trigger?: React.ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Reactions close after one pick; the composer stays open to insert several. */
  closeOnSelect?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string>(EMOJI_CATEGORIES[0]!.key);
  // Read on each open rather than held in a store: localStorage is the source of truth
  // and the picker is the only thing that writes it.
  const [recent, setRecent] = useState<string[]>([]);

  const results = useMemo(() => (query.trim() ? searchEmojis(query) : null), [query]);
  const active = EMOJI_CATEGORIES.find((c) => c.key === activeKey) ?? EMOJI_CATEGORIES[0]!;

  const pick = (emoji: string) => {
    setRecent(pushRecentEmoji(emoji));
    onSelect(emoji);
    // The composer keeps it open so several emoji can be inserted in a row (V2's
    // behaviour); a reaction is a single choice, so that caller closes it.
    if (closeOnSelect) setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRecent(getRecentEmojis());
        else setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          trigger ?? (
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Insert emoji"
              title="Insert emoji"
            />
          )
        }
      >
        {/* A caller-supplied trigger brings its own content. */}
        {trigger ? undefined : <Smile className="size-4" />}
      </PopoverTrigger>

      <PopoverContent side={side} align={align} className="w-80 gap-0 p-0">
        {/* Quick row — the defaults, before any history exists. */}
        <div className="flex flex-wrap gap-0.5 border-b border-border p-2">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => pick(emoji)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-md text-base transition-colors hover:bg-muted"
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji..."
            aria-label="Search emoji"
            className="h-8 pl-7 pr-7 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear emoji search"
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {!results && (
          <div className="flex items-center gap-0.5 border-b border-border px-2 py-1.5">
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveKey(RECENT_KEY)}
                title="Recently used"
                aria-label="Recently used"
                className={cn(
                  "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
                  activeKey === RECENT_KEY ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Clock className="size-4" />
              </button>
            )}
            {EMOJI_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category.key] ?? Smile;
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => setActiveKey(category.key)}
                  title={category.label}
                  aria-label={category.label}
                  className={cn(
                    "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
                    activeKey === category.key
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        )}

        <div className="max-h-56 overflow-y-auto p-2">
          {results ? (
            <EmojiGrid emojis={results} onPick={pick} />
          ) : activeKey === RECENT_KEY ? (
            <EmojiGrid emojis={recent} onPick={pick} />
          ) : (
            <>
              <p className="mb-1.5 px-0.5 text-[11px] font-medium text-muted-foreground">{active.label}</p>
              <EmojiGrid emojis={active.emojis} onPick={pick} />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
