import type { FeedPost } from "../apis/types";

export type FeedPostCardProps = { post: FeedPost; currentUserIsAuthor: boolean };

export type SectionErrorProps = { message: string; onRetry: () => void };
