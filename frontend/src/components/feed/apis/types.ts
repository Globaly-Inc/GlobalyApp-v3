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
  mentions: Mention[];
  is_pinned: boolean;
  reactions_count: number;
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

export type CreatePostInput = {
  content: string;
  post_type: string;
  visibility: string;
  business_id?: number | null;
  media?: Omit<PostMedia, "url">[];
  mentions?: Mention[];
};

export type ComposeWithAiInput = {
  post_type: string;
  draft?: string | null;
  instruction?: string | null;
};

/** Resolved at comment time — kept on the comment even if the person later leaves the business. */
export type Mention = { platform_user_id: number; first_name: string | null; last_name: string | null };

/** A member who can be @mentioned — the shape the mention picker needs, nothing more. */
export type MentionCandidate = { platform_user_id: number; first_name: string | null; last_name: string | null; photo_url: string | null };

export type FeedComment = {
  id: number;
  post_id: number;
  author_platform_user_id: number;
  content: string;
  mentions: Mention[];
  media: PostMedia[];
  created_at: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_photo_url: string | null;
  is_mine: boolean;
  reactions_count: number;
  my_reaction: string | null;
  reactions: ReactionGroup[];
};

export type CreateCommentInput = { content: string; mentions: Mention[]; media?: Omit<PostMedia, "url">[] };
