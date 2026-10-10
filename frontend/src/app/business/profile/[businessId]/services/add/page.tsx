import { ServiceFormRouter } from "@/app/business/profile/components/services/service-form-router";

export default async function BusinessAddServicePage({ params }: Readonly<{ params: Promise<{ businessId: string }> }>) {
  const { businessId } = await params;
  return <ServiceFormRouter businessId={Number(businessId)} />;
}
