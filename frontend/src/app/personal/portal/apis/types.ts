export type MediaKind = "image" | "video";

/** `url` is a signed view URL minted per read — never persisted on the post. */
export type PostMedia = { storage_path: string; type: MediaKind; mime_type: string; url: string };

export type FeedPost = {
  id: number;
  author_platform_user_id: number;
  business_id: number | null;
  post_type: string;
  visibility: string;
  content: string;
  media: PostMedia[];
  is_pinned: boolean;
  reactions_count: number;
  /** Denormalised on the post, so a page of posts costs no extra query. */
  comments_count: number;
  created_at: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_photo_url: string | null;
  business_name: string | null;
  business_logo_url: string | null;
  /** The caller's own reaction, so the client knows whether to POST (add/update) or DELETE (remove). */
  my_reaction: string | null;
  /** Decided server-side — the client never infers authorship. */
  is_mine: boolean;
  /** Grouped by emoji, most-reacted first, with a few reactors each for the avatar stack. */
  reactions: ReactionGroup[];
};

export type ReactionGroup = {
  emoji: string;
  count: number;
  reactors: { first_name: string | null; photo_url: string | null }[];
};

export type FeedPage = { posts: FeedPost[]; next_cursor: string | null };

export type FeedComment = {
  id: number;
  post_id: number;
  author_platform_user_id: number;
  /** Carried through from the API for V1 parity; the thread renders flat. */
  parent_comment_id: number | null;
  content: string;
  created_at: string;
  updated_at: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_photo_url: string | null;
  /** Decided server-side — the client never infers authorship. */
  is_mine: boolean;
};

/** Oldest-first keyset page: the cursor is opaque, and a new comment only ever lands on a later page. */
export type FeedCommentPage = { comments: FeedComment[]; next_cursor: string | null };

export type CreatePostInput = {
  content: string;
  post_type: string;
  visibility: string;
  business_id?: number | null;
  media?: Omit<PostMedia, "url">[];
};

export type ComposeWithAiInput = {
  post_type: string;
  draft?: string | null;
  instruction?: string | null;
};
