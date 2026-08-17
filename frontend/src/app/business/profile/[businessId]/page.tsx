import { BusinessProfileDetailView } from "@/app/business/profile/business-profile-detail-view";

export default async function BusinessProfilePage({ params }: Readonly<{ params: Promise<{ businessId: string }> }>) {
  const { businessId } = await params;
  return <BusinessProfileDetailView businessId={Number(businessId)} />;
}
