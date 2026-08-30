export type BlogCardData = {
  id: number;
  title: string;
  slug: string;
  published_at: string | null;
  category: string | null;
  cover_image_url: string | null;
};

// Shown only while the real feed loads or if it comes back empty — ported from V2's STATIC_BLOG_POSTS.
export const FALLBACK_BLOG_POSTS: BlogCardData[] = [
  {
    id: 1,
    title: "Pre-Departure Checklist for Studying in Australia (2025 Edition)",
    slug: "pre-departure-checklist-australia-2025",
    published_at: "2025-01-15",
    category: "Country Guides",
    cover_image_url: "https://cdn.sanity.io/images/0jnrsohu/production/7fb2ee35cf2c5a7b2748e5bcbb80e696d1b4c4ff-1200x630.jpg",
  },
  {
    id: 2,
    title: "Is Australia the Right Destination for You?",
    slug: "is-australia-right-for-you",
    published_at: "2025-01-20",
    category: "Study Abroad",
    cover_image_url: "https://cdn.sanity.io/images/0jnrsohu/production/8bfe74c0a6e1b97e50a67a3c3e93cd1ad9de8c7b-1200x630.jpg",
  },
  {
    id: 3,
    title: "Public vs. Private Universities in Australia: What's Right for You?",
    slug: "public-vs-private-universities-australia",
    published_at: "2025-02-01",
    category: "University Admissions",
    cover_image_url: "https://cdn.sanity.io/images/0jnrsohu/production/9c1f6f3e5a7d2b8e4c9f1a2b3d4e5f6a7b8c9d0e-1200x630.jpg",
  },
  {
    id: 4,
    title: "Canada's Language Sector Faces Pressure as International Students Decline",
    slug: "canada-language-sector-international-students",
    published_at: "2025-02-10",
    category: "Country Guides",
    cover_image_url: "https://cdn.sanity.io/images/0jnrsohu/production/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0-1200x630.jpg",
  },
];
