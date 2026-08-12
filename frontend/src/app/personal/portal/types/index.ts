import type { Completion } from "@/app/personal/apis/types";
import type { FeedPost, PendingInvite, PositionUpdate, RecentEnquiry } from "../apis/types";

export type CompletionCardProps = { completion: Completion };

export type StatTilesProps = { favorites: number; enquiries: number; completionPct: number };

export type RecentEnquiriesCardProps = { enquiries: RecentEnquiry[] };

export type PendingInvitesCardProps = { invites: PendingInvite[] };

export type PendingPositionsCardProps = { positions: PositionUpdate[] };

export type FeedPostCardProps = { post: FeedPost; currentUserIsAuthor: boolean };

export type SectionErrorProps = { message: string; onRetry: () => void };

export type WeatherSnapshot = {
  temperature: number;
  condition: string;
  /** Raw WMO code — kept so the icon is chosen from the code, not parsed back out of the label. */
  code: number;
  humidity: number;
  windSpeed: number;
  location: string;
  forecast: { date: string; tempMax: number; tempMin: number; condition: string; code: number }[];
};
