import { ServiceFormRouter } from "@/app/business/profile/components/services/service-form-router";

export default async function BusinessEditServicePage({
  params,
}: Readonly<{ params: Promise<{ businessId: string; serviceId: string }> }>) {
  const { businessId, serviceId } = await params;
  return <ServiceFormRouter businessId={Number(businessId)} serviceId={serviceId} />;
}
