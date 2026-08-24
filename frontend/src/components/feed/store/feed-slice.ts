import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { feedApi } from "../apis";
import type { ComposeWithAiInput, CreateCommentInput, CreatePostInput, FeedComment, FeedPost, ReactionGroup } from "../apis/types";
import type { RootState } from "@/lib/store";

export const fetchFeedPage = createAsyncThunk(
  "feed/fetchFeedPage",
  async ({ postType, cursor }: { postType: string; cursor?: string | null }) => {
    const page = await feedApi.listFeed({ postType, cursor });
    return { ...page, append: !!cursor };
  },
);

export const createFeedPost = createAsyncThunk("feed/createPost", (input: CreatePostInput) =>
  feedApi.createPost(input),
);

export const uploadFeedMedia = createAsyncThunk("feed/uploadMedia", (file: File) => feedApi.uploadMedia(file));

export const composeWithAi = createAsyncThunk("feed/composeWithAi", (input: ComposeWithAiInput) =>
  feedApi.composeWithAi(input),
);

export const checkAiAvailable = createAsyncThunk("feed/checkAiAvailable", async () => {
  const { available } = await feedApi.aiAvailable();
  return available;
});

export const deleteFeedPost = createAsyncThunk("feed/deletePost", async (id: number) => {
  await feedApi.deletePost(id);
  return id;
});

/**
 * Add or update the caller's reaction. Mirrors POST /reactions — not a toggle.
 *
 * The caller's own name/photo comes along so the reducer can place them in the avatar stack exactly where a
 * refetch would, instead of showing a count that disagrees with the avatars until the next load.
 */
export const setPostReaction = createAsyncThunk(
  "feed/setReaction",
  async ({ id, emoji }: { id: number; emoji: string }, { getState }) => {
    await feedApi.setReaction(id, emoji);
    const profile = (getState() as RootState).profile.profile;
    return { id, emoji, me: { first_name: profile?.first_name ?? null, photo_url: profile?.photo_url ?? null } };
  },
);

/** Remove the caller's reaction. Mirrors DELETE /reactions. */
export const removePostReaction = createAsyncThunk("feed/removeReaction", async (id: number) => {
  await feedApi.removeReaction(id);
  return id;
});

export const fetchComments = createAsyncThunk("feed/fetchComments", async (postId: number) => {
  const comments = await feedApi.listComments(postId);
  return { postId, comments };
});

export const addComment = createAsyncThunk(
  "feed/addComment",
  async ({ postId, input }: { postId: number; input: CreateCommentInput }) => {
    const comment = await feedApi.addComment(postId, input);
    return { postId, comment };
  },
);

export const deleteComment = createAsyncThunk(
  "feed/deleteComment",
  async ({ postId, commentId }: { postId: number; commentId: number }) => {
    await feedApi.deleteComment(postId, commentId);
    return { postId, commentId };
  },
);

/** Add or update the caller's reaction on a comment. Mirrors setPostReaction. */
export const setCommentReaction = createAsyncThunk(
  "feed/setCommentReaction",
  async ({ postId, commentId, emoji }: { postId: number; commentId: number; emoji: string }, { getState }) => {
    await feedApi.setCommentReaction(postId, commentId, emoji);
    const profile = (getState() as RootState).profile.profile;
    return { postId, commentId, emoji, me: { first_name: profile?.first_name ?? null, photo_url: profile?.photo_url ?? null } };
  },
);

export const removeCommentReaction = createAsyncThunk(
  "feed/removeCommentReaction",
  async ({ postId, commentId }: { postId: number; commentId: number }) => {
    await feedApi.removeCommentReaction(postId, commentId);
    return { postId, commentId };
  },
);

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

type FeedState = {
  posts: FeedPost[];
  nextCursor: string | null;
  feedStatus: RegionStatus;
  feedLoadingMore: boolean;
  feedError: string | null;
  postType: string;
  /** null = not checked yet; the composer hides the AI affordance when the backend has no key. */
  aiAvailable: boolean | null;
  /** Comments only load once a post's thread is opened, keyed by post id. */
  commentsByPost: Record<number, { items: FeedComment[]; status: RegionStatus }>;
};

const initialState: FeedState = {
  posts: [],
  nextCursor: null,
  feedStatus: "idle",
  feedLoadingMore: false,
  feedError: null,
  postType: "all",
  aiAvailable: null,
  commentsByPost: {},
};

const feedSlice = createSlice({
  name: "feed",
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

      .addCase(fetchComments.pending, (state, action) => {
        state.commentsByPost[action.meta.arg] = { items: state.commentsByPost[action.meta.arg]?.items ?? [], status: "loading" };
      })
      .addCase(fetchComments.fulfilled, (state, action) => {
        state.commentsByPost[action.payload.postId] = { items: action.payload.comments, status: "idle" };
      })
      .addCase(fetchComments.rejected, (state, action) => {
        state.commentsByPost[action.meta.arg] = { items: state.commentsByPost[action.meta.arg]?.items ?? [], status: "failed" };
      })
      .addCase(addComment.fulfilled, (state, action) => {
        const { postId, comment } = action.payload;
        const bucket = state.commentsByPost[postId] ?? { items: [], status: "idle" };
        state.commentsByPost[postId] = { ...bucket, items: [...bucket.items, comment] };
        const post = state.posts.find((p) => p.id === postId);
        if (post) post.comments_count += 1;
      })
      .addCase(deleteComment.fulfilled, (state, action) => {
        const { postId, commentId } = action.payload;
        const bucket = state.commentsByPost[postId];
        if (bucket) bucket.items = bucket.items.filter((c) => c.id !== commentId);
        const post = state.posts.find((p) => p.id === postId);
        if (post) post.comments_count = Math.max(post.comments_count - 1, 0);
      })
      .addCase(setCommentReaction.fulfilled, (state, action) => {
        const { postId, commentId, emoji, me } = action.payload;
        const bucket = state.commentsByPost[postId];
        if (!bucket) return;
        bucket.items = bucket.items.map((c) => {
          if (c.id !== commentId) return c;
          const groups = withoutMe(c.reactions, c.my_reaction, me);
          const existing = groups.find((g) => g.emoji === emoji);
          if (existing) {
            existing.count += 1;
            if (existing.reactors.length < MAX_REACTOR_AVATARS) existing.reactors.push(me);
          } else {
            groups.push({ emoji, count: 1, reactors: [me] });
          }
          return {
            ...c,
            reactions_count: c.my_reaction ? c.reactions_count : c.reactions_count + 1,
            my_reaction: emoji,
            reactions: groups.sort((a, b) => b.count - a.count),
          };
        });
      })
      .addCase(removeCommentReaction.fulfilled, (state, action) => {
        const { postId, commentId } = action.payload;
        const bucket = state.commentsByPost[postId];
        if (!bucket) return;
        bucket.items = bucket.items.map((c) =>
          c.id === commentId
            ? {
                ...c,
                reactions_count: Math.max(c.reactions_count - (c.my_reaction ? 1 : 0), 0),
                reactions: withoutMe(c.reactions, c.my_reaction, null).sort((a, b) => b.count - a.count),
                my_reaction: null,
              }
            : c,
        );
      });
  },
});

export const { setPostTypeFilter } = feedSlice.actions;
export const feedReducer = feedSlice.reducer;
