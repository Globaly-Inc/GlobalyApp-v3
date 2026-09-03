/**
 * Unsent composer text, per conversation, in localStorage.
 *
 * Ported from GlobalyOS V2's `stores/chatDraftStore.ts` — drafts are deliberately
 * client-only there too, so there is no draft table and no endpoint to add here. A
 * draft is worth surviving a reload, not worth a round trip on every keystroke.
 *
 * Exposed as a `useSyncExternalStore` source rather than Redux for the same reason V2
 * keeps it outside its query cache: the writer is a `onChange` handler and the readers
 * (the sidebar's count, the Drafts view) are unrelated components.
 */

const STORAGE_KEY = "globaly-chat-drafts";

export interface ChatDraft {
  distributionId: string;
  /** Denormalised so the Drafts view can name the conversation without the thread list. */
  counterpartName: string;
  content: string;
  updatedAt: string;
}

type DraftMap = Record<string, ChatDraft>;

let cache: DraftMap | null = null;
let sortedCache: ChatDraft[] | null = null;
const listeners = new Set<() => void>();

function read(): DraftMap {
  // SSR has no localStorage, and the empty map is the correct pre-hydration answer.
  if (typeof window === "undefined") return {};
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(drafts: DraftMap) {
  cache = drafts;
  sortedCache = null;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // A full or blocked storage quota must not break sending a message.
  }
  listeners.forEach((fn) => fn());
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Empty content deletes the draft — an emptied composer is not a draft. */
export function saveDraft(distributionId: string, counterpartName: string, content: string) {
  const drafts = { ...read() };
  if (!content.trim()) {
    if (!drafts[distributionId]) return; // nothing to change, so don't wake subscribers
    delete drafts[distributionId];
  } else {
    drafts[distributionId] = { distributionId, counterpartName, content, updatedAt: new Date().toISOString() };
  }
  write(drafts);
}

export function getDraft(distributionId: string): string {
  return read()[distributionId]?.content ?? "";
}

export function deleteDraft(distributionId: string) {
  const drafts = { ...read() };
  if (!drafts[distributionId]) return;
  delete drafts[distributionId];
  write(drafts);
}

/**
 * Newest first. The array identity is cached because `useSyncExternalStore` compares
 * snapshots by reference and would loop forever on a fresh array each call.
 */
export function getAllDrafts(): ChatDraft[] {
  sortedCache ??= Object.values(read()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return sortedCache;
}

export function getDraftCount(): number {
  return getAllDrafts().length;
}

/** Server snapshot for `useSyncExternalStore` — stable empty array, no localStorage. */
const EMPTY: ChatDraft[] = [];
export const getServerDrafts = () => EMPTY;
export const getServerDraftCount = () => 0;
