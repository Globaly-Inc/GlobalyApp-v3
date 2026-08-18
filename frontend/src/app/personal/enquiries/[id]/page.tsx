import { EnquiryDetailView } from "../components/enquiry-detail-view";

export default async function EnquiryDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <EnquiryDetailView enquiryId={id} />;
}
