export type Destination = {
  id: string;
  name: string;
  slug: string;
  flagEmoji: string;
  heroImageUrl: string | null;
  /** Hero photo, falling back to the thumbnail — null when the admin uploaded neither. */
  /** ISO-2 code, used for the flag chip on the /for-students destination cards. */
  code: string | null;
  institutionsLabel: string | null;
  tuitionMin: number | null;
  tuitionMax: number | null;
  tuitionCurrency: string | null;
  livingCostLabel: string | null;
};
