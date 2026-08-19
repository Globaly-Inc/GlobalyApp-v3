export type Destination = {
  id: string;
  name: string;
  slug: string;
  flagEmoji: string;
  /** Marketing photograph for the destination shelf. Null for a country with no photo on file. */
  heroImageUrl: string | null;
};
