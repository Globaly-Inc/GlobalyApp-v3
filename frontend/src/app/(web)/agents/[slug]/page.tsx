import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrgProfile } from "../../profiles/api";
import { OrgProfileView } from "../../profiles/components/org-profile-view";

type Props = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await getOrgProfile("agent", slug);
  if (!org) return { title: "Agent not found — Globaly" };
  return {
    title: org.seo.title,
    description: org.seo.description,
    alternates: { canonical: org.seo.canonical_url },
    openGraph: {
      title: org.seo.title,
      description: org.seo.description,
      url: org.seo.canonical_url,
      images: org.seo.og_image ? [org.seo.og_image] : undefined,
    },
  };
}

export default async function AgentProfilePage({ params }: Props) {
  const { slug } = await params;
  const org = await getOrgProfile("agent", slug);
  if (!org) notFound();
  return <OrgProfileView org={org} />;
}
