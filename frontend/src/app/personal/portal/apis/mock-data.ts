import type { ComposeWithAiInput, CreatePostInput, FeedPage, FeedPost, HomeSummary, PendingInvite, PositionUpdate, PostMedia, ReactionGroup } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mockInvites: PendingInvite[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    business_id: 1,
    tenant_invitation_id: "22222222-2222-4222-8222-222222222222",
    role: "counsellor",
    position: null,
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    business_name: "Northbridge Education",
    logo_url: null,
    org_id: "mock-org",
  },
];

let mockPositions: PositionUpdate[] = [
  {
    membership_id: 1,
    business_id: 1,
    business_name: "Northbridge Education",
    position: "Senior Counsellor",
    previous_position: "Counsellor",
    kind: "changed",
  },
];

let mockPosts: FeedPost[] = [
  {
    id: 2,
    author_platform_user_id: 1,
    business_id: null,
    post_type: "social",
    visibility: "everyone",
    content: "Just submitted my application to Melbourne. Fingers crossed 🤞",
    media: [],
    reactions: [
      { emoji: "❤️", count: 3, reactors: [{ first_name: "Ana", photo_url: null }, { first_name: "Bo", photo_url: null }] },
      { emoji: "🎉", count: 1, reactors: [{ first_name: "Cy", photo_url: null }] },
    ],
    is_pinned: false,
    reactions_count: 4,
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    author_first_name: "Test",
    author_last_name: "Student",
    author_photo_url: null,
    business_name: null,
    business_logo_url: null,
    my_reaction: null,
    is_mine: true,
  },
  {
    id: 1,
    author_platform_user_id: 2,
    business_id: 1,
    post_type: "announcement",
    visibility: "everyone",
    content: "Applications for the February intake close on the 20th.",
    media: [],
    reactions: [
      {
        emoji: "👍",
        count: 12,
        reactors: [
          { first_name: "Dee", photo_url: null },
          { first_name: "Eli", photo_url: null },
          { first_name: "Fay", photo_url: null },
        ],
      },
    ],
    is_pinned: true,
    reactions_count: 12,
    created_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
    author_first_name: "Northbridge",
    author_last_name: "Admissions",
    author_photo_url: null,
    business_name: "Northbridge Education",
    business_logo_url: null,
    my_reaction: "👍",
    is_mine: false,
  },
];

let nextPostId = 3;

function dropMockReaction(groups: ReactionGroup[], previousEmoji: string | null): ReactionGroup[] {
  if (!previousEmoji) return groups.map((g) => ({ ...g, reactors: [...g.reactors] }));
  return groups
    .map((g) => (g.emoji === previousEmoji ? { ...g, count: g.count - 1, reactors: [...g.reactors] } : { ...g, reactors: [...g.reactors] }))
    .filter((g) => g.count > 0);
}

export const homeMockApi = {
  getSummary: async (): Promise<HomeSummary> => {
    console.log("[mock] GET /personal-home/summary");
    await delay(300);
    return {
      completion: {
        percentage: 60,
        badges: [
          { key: "personal_info", label: "Personal info", done: true },
          { key: "education_history", label: "Education history", done: true },
          { key: "english_scores", label: "English scores", done: false },
          { key: "preferences", label: "Preferences", done: false },
          { key: "profile_photo", label: "Profile photo", done: false },
        ],
      },
      enquiries_count: 12, // deliberately > 5: the tile must show the true total, not the recent count
      recent_enquiries: [
        {
          id: 1,
          message: "I'd like to know about scholarship options for the Master of Data Science.",
          status: "responded",
          preferred_intake: "February",
          preferred_year: 2027,
          created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
          institution_name: "University of Melbourne",
        },
        {
          id: 2,
          message: "Can I apply with a 6.5 IELTS?",
          status: "pending",
          preferred_intake: "July",
          preferred_year: 2027,
          created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
          institution_name: "Monash University",
        },
      ],
      favorites_count: 7,
      pending_invites: mockInvites,
      position_updates: mockPositions,
      degraded: [],
    };
  },

  listFeed: async (params: { postType?: string; cursor?: string | null }): Promise<FeedPage> => {
    console.log("[mock] GET /feed/posts", params);
    await delay(300);
    if (params.cursor) return { posts: [], next_cursor: null };
    const posts =
      params.postType && params.postType !== "all"
        ? mockPosts.filter((p) => p.post_type === params.postType)
        : mockPosts;
    return { posts, next_cursor: null };
  },

  createPost: async (input: CreatePostInput): Promise<FeedPost> => {
    console.log("[mock] POST /feed/posts", input);
    await delay(300);
    const post: FeedPost = {
      id: nextPostId++,
      author_platform_user_id: 1,
      business_id: input.business_id ?? null,
      post_type: input.post_type,
      visibility: input.visibility,
      content: input.content,
      media: (input.media ?? []).map((m) => ({ ...m, url: m.storage_path })),
      reactions: [],
      is_pinned: false,
      reactions_count: 0,
      created_at: new Date().toISOString(),
      author_first_name: "Test",
      author_last_name: "Student",
      author_photo_url: null,
      business_name: null,
      business_logo_url: null,
      my_reaction: null,
      is_mine: true,
    };
    mockPosts = [post, ...mockPosts];
    return post;
  },

  uploadMedia: async (file: File): Promise<PostMedia> => {
    console.log("[mock] POST /feed/media", file.name, file.type);
    await delay(400);
    // In mock mode the object URL doubles as the storage path, so a posted attachment still renders in the
    // timeline (the real API mints a signed view URL from the stored path instead).
    const objectUrl = URL.createObjectURL(file);
    return {
      storage_path: objectUrl,
      type: file.type.startsWith("video/") ? "video" : "image",
      mime_type: file.type,
      url: objectUrl,
    };
  },

  aiAvailable: async (): Promise<{ available: boolean }> => {
    console.log("[mock] GET /feed/ai/available");
    await delay(100);
    return { available: true };
  },

  composeWithAi: async (input: ComposeWithAiInput): Promise<{ content: string }> => {
    console.log("[mock] POST /feed/ai/compose", input);
    await delay(900);
    const base = input.draft?.trim()
      ? `${input.draft.trim()} — and I'd love to hear from anyone who has been through the same process.`
      : "Just submitted my application for the February intake. Six months of IELTS prep and three drafts of my SOP later, it's finally in. If you're applying to Melbourne this cycle, say hi.";
    return { content: base };
  },

  deletePost: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /feed/posts", id);
    await delay(200);
    mockPosts = mockPosts.filter((p) => p.id !== id);
  },

  // The mock keeps the grouped `reactions` coherent as well as the total, so mock mode exercises the same
  // rendering paths as the real API rather than a simplified version of them.
  setReaction: async (id: number, emoji: string): Promise<void> => {
    console.log("[mock] POST /feed/posts/:id/reactions", id, emoji);
    await delay(150);
    mockPosts = mockPosts.map((p) => {
      if (p.id !== id) return p;
      const groups = dropMockReaction(p.reactions, p.my_reaction);
      const existing = groups.find((g) => g.emoji === emoji);
      if (existing) existing.count += 1;
      else groups.push({ emoji, count: 1, reactors: [{ first_name: "Test", photo_url: null }] });
      return {
        ...p,
        my_reaction: emoji,
        reactions_count: p.my_reaction ? p.reactions_count : p.reactions_count + 1,
        reactions: groups.sort((a, b) => b.count - a.count),
      };
    });
  },

  removeReaction: async (id: number): Promise<void> => {
    console.log("[mock] DELETE /feed/posts/:id/reactions", id);
    await delay(150);
    mockPosts = mockPosts.map((p) =>
      p.id === id
        ? {
            ...p,
            my_reaction: null,
            reactions_count: Math.max(p.reactions_count - (p.my_reaction ? 1 : 0), 0),
            reactions: dropMockReaction(p.reactions, p.my_reaction),
          }
        : p,
    );
  },

  respondToInvite: async (inviteId: string, action: "accept" | "decline"): Promise<void> => {
    console.log("[mock] POST /platform-users/me/business-invites/:id/respond", inviteId, action);
    await delay(250);
    mockInvites = mockInvites.filter((i) => i.id !== inviteId);
  },

  confirmPosition: async (membershipId: number): Promise<void> => {
    console.log("[mock] POST /platform-users/me/position-updates/:id/confirm", membershipId);
    await delay(250);
    mockPositions = mockPositions.filter((p) => p.membership_id !== membershipId);
  },
};
