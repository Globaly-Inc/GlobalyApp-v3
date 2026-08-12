import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { homeApi } from "../apis";
import type { ComposeWithAiInput, CreatePostInput, FeedPost, HomeSummary, ReactionGroup } from "../apis/types";
import type { RootState } from "@/lib/store";

// Separate status per region: the summary failing must not blank the feed, and vice versa.
export const fetchHomeSummary = createAsyncThunk("home/fetchSummary", () => homeApi.getSummary());

export const fetchFeedPage = createAsyncThunk(
  "home/fetchFeedPage",
  async ({ postType, cursor }: { postType: string; cursor?: string | null }) => {
    const page = await homeApi.listFeed({ postType, cursor });
    return { ...page, append: !!cursor };
  },
);

export const createFeedPost = createAsyncThunk("home/createPost", (input: CreatePostInput) =>
  homeApi.createPost(input),
);

export const uploadFeedMedia = createAsyncThunk("home/uploadMedia", (file: File) => homeApi.uploadMedia(file));

export const composeWithAi = createAsyncThunk("home/composeWithAi", (input: ComposeWithAiInput) =>
  homeApi.composeWithAi(input),
);

export const checkAiAvailable = createAsyncThunk("home/checkAiAvailable", async () => {
  const { available } = await homeApi.aiAvailable();
  return available;
});

export const deleteFeedPost = createAsyncThunk("home/deletePost", async (id: number) => {
  await homeApi.deletePost(id);
  return id;
});

/**
 * Add or update the caller's reaction. Mirrors POST /reactions — not a toggle.
 *
 * The caller's own name/photo comes along so the reducer can place them in the avatar stack exactly where a
 * refetch would, instead of showing a count that disagrees with the avatars until the next load.
 */
export const setPostReaction = createAsyncThunk(
  "home/setReaction",
  async ({ id, emoji }: { id: number; emoji: string }, { getState }) => {
    await homeApi.setReaction(id, emoji);
    const profile = (getState() as RootState).profile.profile;
    return { id, emoji, me: { first_name: profile?.first_name ?? null, photo_url: profile?.photo_url ?? null } };
  },
);

/** Remove the caller's reaction. Mirrors DELETE /reactions. */
export const removePostReaction = createAsyncThunk("home/removeReaction", async (id: number) => {
  await homeApi.removeReaction(id);
  return id;
});

export const respondToInvite = createAsyncThunk(
  "home/respondToInvite",
  async ({ inviteId, action }: { inviteId: string; action: "accept" | "decline" }) => {
    await homeApi.respondToInvite(inviteId, action);
    return inviteId;
  },
);

export const confirmPosition = createAsyncThunk("home/confirmPosition", async (membershipId: number) => {
  await homeApi.confirmPosition(membershipId);
  return membershipId;
});

/** Mirrors the server's cap, so the client's stack never shows more faces than a refetch would. */
const MAX_REACTOR_AVATARS = 3;

/**
 * Drop the caller's previous reaction from its group, removing the group entirely when it empties.
 * `me` is only used to decide which avatar to pull out of the stack.
 */
function withoutMe(
  groups: ReactionGroup[],
  previousEmoji: string | null,
  me: { first_name: string | null; photo_url: string | null } | null,
): ReactionGroup[] {
  if (!previousEmoji) return groups.map((g) => ({ ...g, reactors: [...g.reactors] }));
  return groups
    .map((group) => {
      if (group.emoji !== previousEmoji) return { ...group, reactors: [...group.reactors] };
      const reactors = [...group.reactors];
      const index = me ? reactors.findIndex((r) => r.first_name === me.first_name) : -1;
      // If my avatar wasn't in the (capped) stack, drop the last one so the visible faces still fit the count.
      reactors.splice(index >= 0 ? index : reactors.length - 1, 1);
      return { ...group, count: group.count - 1, reactors };
    })
    .filter((group) => group.count > 0);
}

type RegionStatus = "idle" | "loading" | "failed";

type HomeState = {
  summary: HomeSummary | null;
  summaryStatus: RegionStatus;
  summaryError: string | null;
  posts: FeedPost[];
  nextCursor: string | null;
  feedStatus: RegionStatus;
  feedLoadingMore: boolean;
  feedError: string | null;
  postType: string;
  actionError: string | null;
  /** null = not checked yet; the composer hides the AI affordance when the backend has no key. */
  aiAvailable: boolean | null;
};

const initialState: HomeState = {
  summary: null,
  summaryStatus: "idle",
  summaryError: null,
  posts: [],
  nextCursor: null,
  feedStatus: "idle",
  feedLoadingMore: false,
  feedError: null,
  postType: "all",
  actionError: null,
  aiAvailable: null,
};

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    setPostTypeFilter(state, action: { payload: string }) {
      state.postType = action.payload;
      state.posts = [];
      state.nextCursor = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchHomeSummary.pending, (state) => {
        state.summaryStatus = "loading";
        state.summaryError = null;
      })
      .addCase(fetchHomeSummary.fulfilled, (state, action) => {
        state.summaryStatus = "idle";
        state.summary = action.payload;
      })
      .addCase(fetchHomeSummary.rejected, (state, action) => {
        state.summaryStatus = "failed";
        state.summaryError = action.error.message ?? "Couldn't load your dashboard.";
      })

      .addCase(fetchFeedPage.pending, (state, action) => {
        if (action.meta.arg.cursor) state.feedLoadingMore = true;
        else state.feedStatus = "loading";
        state.feedError = null;
      })
      .addCase(fetchFeedPage.fulfilled, (state, action) => {
        state.feedStatus = "idle";
        state.feedLoadingMore = false;
        state.posts = action.payload.append ? [...state.posts, ...action.payload.posts] : action.payload.posts;
        state.nextCursor = action.payload.next_cursor;
      })
      .addCase(fetchFeedPage.rejected, (state, action) => {
        state.feedStatus = "failed";
        state.feedLoadingMore = false;
        state.feedError = action.error.message ?? "Couldn't load the feed.";
      })

      .addCase(createFeedPost.fulfilled, (state, action) => {
        state.posts = [action.payload, ...state.posts];
      })
      .addCase(checkAiAvailable.fulfilled, (state, action) => {
        state.aiAvailable = action.payload;
      })
      .addCase(checkAiAvailable.rejected, (state) => {
        state.aiAvailable = false;
      })
      .addCase(deleteFeedPost.fulfilled, (state, action) => {
        state.posts = state.posts.filter((p) => p.id !== action.payload);
      })
      .addCase(setPostReaction.fulfilled, (state, action) => {
        const { id, emoji, me } = action.payload;
        state.posts = state.posts.map((p) => {
          if (p.id !== id) return p;
          const groups = withoutMe(p.reactions, p.my_reaction, me);
          const existing = groups.find((g) => g.emoji === emoji);
          if (existing) {
            existing.count += 1;
            if (existing.reactors.length < MAX_REACTOR_AVATARS) existing.reactors.push(me);
          } else {
            groups.push({ emoji, count: 1, reactors: [me] });
          }
          return {
            ...p,
            // Changing an existing reaction does not change the total — matches the server's rule.
            reactions_count: p.my_reaction ? p.reactions_count : p.reactions_count + 1,
            my_reaction: emoji,
            reactions: groups.sort((a, b) => b.count - a.count),
          };
        });
      })
      .addCase(removePostReaction.fulfilled, (state, action) => {
        state.posts = state.posts.map((p) =>
          p.id === action.payload
            ? {
                ...p,
                reactions_count: Math.max(p.reactions_count - (p.my_reaction ? 1 : 0), 0),
                reactions: withoutMe(p.reactions, p.my_reaction, null).sort((a, b) => b.count - a.count),
                my_reaction: null,
              }
            : p,
        );
      })

      // Acting on an invite or position removes the row locally — no page reload, no refetch.
      .addCase(respondToInvite.fulfilled, (state, action) => {
        if (!state.summary) return;
        state.summary.pending_invites = state.summary.pending_invites.filter((i) => i.id !== action.payload);
      })
      .addCase(respondToInvite.rejected, (state, action) => {
        state.actionError = action.error.message ?? "Couldn't respond to the invitation.";
      })
      .addCase(confirmPosition.fulfilled, (state, action) => {
        if (!state.summary) return;
        state.summary.position_updates = state.summary.position_updates.filter(
          (p) => p.membership_id !== action.payload,
        );
      })
      .addCase(confirmPosition.rejected, (state, action) => {
        state.actionError = action.error.message ?? "Couldn't confirm the position.";
      });
  },
});

export const { setPostTypeFilter } = homeSlice.actions;
export const homeReducer = homeSlice.reducer;
