"use client";

import { useMemo, useRef, useState } from "react";
import { MessageSquare, Search, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MIN_SEARCH_LENGTH } from "./const";
import { initials, listStamp, previewText, threadTitle, threadAvatar } from "./utils";
import type { EnquiryMessage, ChatThread } from "./types";

/**
 * Search chat — GlobalyOS V2's `GlobalChatSearch`: the same input-in-sidebar with a
 * results popover under it, the same two-character minimum, the same grouped headings,
 * the same highlighted matches, the same keyboard-hint footer.
 *
 * V2 searches four things (members, DMs/groups, spaces, messages) through a server
 * endpoint. Here only two exist — conversations and messages — and both are searched
 * client-side: the thread list is already fully loaded, and messages are searched across
 * whichever threads the session has opened, which is what `byDistribution` holds. No
 * search endpoint is added for that.
 *
 * ponytail: client-side over loaded data. Add a server search endpoint when a student
 * can plausibly have more threads than one screen.
 */

function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
  if (query.length < MIN_SEARCH_LENGTH) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-primary/20 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const ROW = "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted";
const HEADING = "px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground";

export function ChatSearch({
  threads,
  messagesByThread,
  onOpenThread,
}: Readonly<{
  threads: ChatThread[];
  messagesByThread: Record<string, EnquiryMessage[]>;
  onOpenThread: (distributionId: string, messageId?: number) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < MIN_SEARCH_LENGTH) return { conversations: [], messages: [] };

    const conversations = threads.filter(
      (t) => threadTitle(t).toLowerCase().includes(q) || t.course_name.toLowerCase().includes(q),
    );

    const messages: Array<{ message: EnquiryMessage; thread: ChatThread }> = [];
    for (const thread of threads) {
      for (const message of messagesByThread[thread.distribution_id] ?? []) {
        if (message.body.toLowerCase().includes(q)) messages.push({ message, thread });
      }
    }
    // Newest hits first, and capped: the popover scrolls, but a thousand rows in it is
    // not a result set anyone reads.
    messages.sort((a, b) => b.message.created_at.localeCompare(a.message.created_at));
    return { conversations, messages: messages.slice(0, 20) };
  }, [query, threads, messagesByThread]);

  const select = (distributionId: string, messageId?: number) => {
    onOpenThread(distributionId, messageId);
    setQuery("");
    setOpen(false);
  };

  const short = query.trim().length < MIN_SEARCH_LENGTH;
  const empty = !short && results.conversations.length === 0 && results.messages.length === 0;

  return (
    // The input is not the trigger: it has to keep its own focus and keystrokes, so the
    // popover is opened manually and anchored to the field's wrapper — the same
    // anchor={ref} pattern as @/components/icon-picker.
    <Popover open={open} onOpenChange={setOpen}>
      <div ref={fieldRef} className="relative w-full">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search chat..."
          aria-label="Search chat"
          className="h-9 w-full border-border bg-muted/50 pl-9 pr-8 focus-visible:bg-background"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <PopoverContent
        anchor={fieldRef}
        align="start"
        sideOffset={4}
        className="w-(--anchor-width) gap-0 p-0 shadow-lg"
        // Focus must stay in the input — the popover opens while the person is typing.
        // ...and it must not be handed back on close either: the input's own onClick
        // would see that focus move and reopen the popover immediately.
        initialFocus={false}
        finalFocus={false}
      >
        <div className="max-h-[320px] overflow-y-auto p-1">
          {short && (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <Search className="mb-2 size-8 opacity-30" aria-hidden />
              <p className="px-5 text-center text-sm">Search your conversations & messages</p>
              <p className="mt-1 text-xs opacity-70">Type at least {MIN_SEARCH_LENGTH} characters</p>
            </div>
          )}

          {empty && (
            <div className="flex flex-col items-center py-6 text-muted-foreground">
              <Search className="mb-2 size-8 opacity-30" aria-hidden />
              <p className="text-sm font-medium">No results for &ldquo;{query.trim()}&rdquo;</p>
              <p className="mt-1 text-xs">Try a different search term</p>
            </div>
          )}

          {results.conversations.length > 0 && (
            <>
              <p className={HEADING}>Conversations ({results.conversations.length})</p>
              {results.conversations.map((thread) => (
                <button
                  key={thread.distribution_id}
                  type="button"
                  className={ROW}
                  onClick={() => select(thread.distribution_id)}
                >
                  <Avatar className="size-8 shrink-0">
                    {threadAvatar(thread) && <AvatarImage src={threadAvatar(thread)!} alt={threadTitle(thread)} />}
                    <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                      {initials(threadTitle(thread))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      <Highlight text={threadTitle(thread)} query={query.trim()} />
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Highlight text={thread.course_name} query={query.trim()} />
                    </p>
                  </div>
                  <Users className="size-4 shrink-0 text-green-600 opacity-40" aria-hidden />
                </button>
              ))}
            </>
          )}

          {results.messages.length > 0 && (
            <>
              <p className={cn(HEADING, results.conversations.length > 0 && "border-t border-border mt-1")}>
                Messages ({results.messages.length})
              </p>
              {results.messages.map(({ message, thread }) => (
                <button
                  key={message.id}
                  type="button"
                  className={ROW}
                  onClick={() => select(thread.distribution_id, message.id)}
                >
                  <Avatar className="size-8 shrink-0">
                    {message.sender_avatar && <AvatarImage src={message.sender_avatar} alt={message.sender_name} />}
                    <AvatarFallback className="bg-muted text-xs text-muted-foreground">
                      {initials(message.sender_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{message.sender_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        <Highlight text={previewText(message.body)} query={query.trim()} />
                      </span>
                      <span className="shrink-0">· {listStamp(message.created_at)}</span>
                    </div>
                  </div>
                  <MessageSquare className="size-4 shrink-0 text-blue-600 opacity-40" aria-hidden />
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 py-0.5">↵</kbd> open
          </span>
          ·
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 py-0.5">esc</kbd> close
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
