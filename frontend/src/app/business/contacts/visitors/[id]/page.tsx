import { VisitorDetailView } from "@/app/business/ai-widget/components/visitor-detail-view";

export default async function ContactsVisitorDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <VisitorDetailView visitorId={Number(id)} />;
}
