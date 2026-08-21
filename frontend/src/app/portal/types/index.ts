import type { LucideIcon } from "lucide-react";
import type { FeedPost } from "../apis/types";

export type FeedPostCardProps = { post: FeedPost; currentUserIsAuthor: boolean };

export type SectionErrorProps = { message: string; onRetry: () => void };

/**
 * Who a post is being written as, and therefore which portal it belongs to.
 *
 * `businessId` is the whole distinction: null publishes into the author's personal portal, a business id
 * publishes into that business's portal. The name and photo are only the composer's own avatar — the card
 * that renders the post afterwards gets its author from the server.
 */
export type PortalIdentity = {
  businessId: number | null;
  name: string | null;
  photoUrl: string | null;
};

export type QuickAction = { label: string; href: string; icon: LucideIcon; color: string };

export type StatTile = { icon: LucideIcon; label: string; value: string; color: string };

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
