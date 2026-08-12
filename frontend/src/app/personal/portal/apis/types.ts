import type { Completion } from "@/app/personal/apis/types";

export type RecentEnquiry = {
  id: number;
  message: string;
  status: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  created_at: string;
  institution_name: string | null;
};

export type PendingInvite = {
  id: string;
  business_id: number;
  tenant_invitation_id: string;
  role: string;
  position: string | null;
  expires_at: string;
  business_name: string | null;
  logo_url: string | null;
  org_id: string | null;
};

export type PositionUpdate = {
  membership_id: number;
  business_id: number;
  business_name: string | null;
  position: string;
  previous_position: string | null;
  /** "new" = never confirmed. "changed" = the position moved after an earlier confirmation. */
  kind: "new" | "changed";
};

export type HomeSummary = {
  completion: Completion;
  enquiries_count: number;
  recent_enquiries: RecentEnquiry[];
  favorites_count: number;
  pending_invites: PendingInvite[];
  position_updates: PositionUpdate[];
  /** Names the sources that failed. A listed key means "show an error", not "the value is zero". */
  degraded: string[];
};

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
};

export type ComposeWithAiInput = {
  post_type: string;
  draft?: string | null;
  instruction?: string | null;
};
