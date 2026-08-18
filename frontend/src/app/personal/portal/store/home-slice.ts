import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { homeApi } from "../apis";
import type { ComposeWithAiInput, CreatePostInput, FeedComment, FeedPost, ReactionGroup } from "../apis/types";
import type { RootState } from "@/lib/store";

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

// ── Comments ──
// Threads are fetched on demand (opening the thread), never eagerly with the timeline: most posts
// are scrolled past, and the post already carries `comments_count` for the collapsed label.

export const fetchComments = createAsyncThunk(
  "home/fetchComments",
  async ({ postId, cursor }: { postId: number; cursor?: string | null }) => {
    const page = await homeApi.listComments(postId, cursor);
    return { postId, ...page, append: !!cursor };
  },
);

export const addComment = createAsyncThunk(
  "home/addComment",
  async ({ postId, content }: { postId: number; content: string }) => homeApi.addComment(postId, content),
);

export const editComment = createAsyncThunk(
  "home/editComment",
  async ({ id, content }: { id: number; content: string }) => homeApi.editComment(id, content),
);

export const deleteComment = createAsyncThunk(
  "home/deleteComment",
  async ({ id, postId }: { id: number; postId: number }) => {
    await homeApi.deleteComment(id);
    return { id, postId };
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

export type CommentThread = {
  items: FeedComment[];
  nextCursor: string | null;
  status: RegionStatus;
  loadingMore: boolean;
  error: string | null;
};

const EMPTY_THREAD: CommentThread = {
  items: [],
  nextCursor: null,
  status: "idle",
  loadingMore: false,
  error: null,
};

type HomeState = {
  posts: FeedPost[];
  nextCursor: string | null;
  feedStatus: RegionStatus;
  feedLoadingMore: boolean;
  feedError: string | null;
  postType: string;
  /** null = not checked yet; the composer hides the AI affordance when the backend has no key. */
  aiAvailable: boolean | null;
  /** Keyed by post id — only threads the user actually opened are ever populated. */
  commentsByPost: Record<number, CommentThread>;
};

const initialState: HomeState = {
  posts: [],
  nextCursor: null,
  feedStatus: "idle",
  feedLoadingMore: false,
  feedError: null,
  postType: "all",
  aiAvailable: null,
  commentsByPost: {},
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
      .addCase(fetchComments.pending, (state, action) => {
        const thread = state.commentsByPost[action.meta.arg.postId] ?? { ...EMPTY_THREAD };
        if (action.meta.arg.cursor) thread.loadingMore = true;
        else thread.status = "loading";
        thread.error = null;
        state.commentsByPost[action.meta.arg.postId] = thread;
      })
      .addCase(fetchComments.fulfilled, (state, action) => {
        const { postId, comments, next_cursor, append } = action.payload;
        const previous = state.commentsByPost[postId] ?? EMPTY_THREAD;
        state.commentsByPost[postId] = {
          items: append ? [...previous.items, ...comments] : comments,
          nextCursor: next_cursor,
          status: "idle",
          loadingMore: false,
          error: null,
        };
      })
      .addCase(fetchComments.rejected, (state, action) => {
        const previous = state.commentsByPost[action.meta.arg.postId] ?? EMPTY_THREAD;
        state.commentsByPost[action.meta.arg.postId] = {
          ...previous,
          status: "failed",
          loadingMore: false,
          error: action.error.message ?? "Couldn't load the comments.",
        };
      })
      .addCase(addComment.fulfilled, (state, action) => {
        const comment = action.payload;
        const previous = state.commentsByPost[comment.post_id] ?? EMPTY_THREAD;
        // Appended, not prepended: the thread reads oldest-first, same as the server's ordering.
        state.commentsByPost[comment.post_id] = { ...previous, items: [...previous.items, comment] };
        state.posts = state.posts.map((p) =>
          p.id === comment.post_id ? { ...p, comments_count: p.comments_count + 1 } : p,
        );
      })
      .addCase(editComment.fulfilled, (state, action) => {
        const comment = action.payload;
        const previous = state.commentsByPost[comment.post_id];
        if (!previous) return;
        state.commentsByPost[comment.post_id] = {
          ...previous,
          items: previous.items.map((c) => (c.id === comment.id ? comment : c)),
        };
      })
      .addCase(deleteComment.fulfilled, (state, action) => {
        const { id, postId } = action.payload;
        const previous = state.commentsByPost[postId];
        if (previous) {
          state.commentsByPost[postId] = { ...previous, items: previous.items.filter((c) => c.id !== id) };
        }
        state.posts = state.posts.map((p) =>
          p.id === postId ? { ...p, comments_count: Math.max(p.comments_count - 1, 0) } : p,
        );
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
      });
  },
});

export const { setPostTypeFilter } = homeSlice.actions;
export const homeReducer = homeSlice.reducer;
