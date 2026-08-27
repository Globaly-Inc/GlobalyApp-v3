export type PublicGuide = {
  id: number;
  title: string;
  slug: string;
  country: string | null;
  context: string | null;
  background_image_url: string | null;
  background_video_url: string | null;
  pdf_cover_image_url: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
};
