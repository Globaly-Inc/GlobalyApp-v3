import { AdminServiceEditor } from "@/app/admin/platform/businesses/components/services/admin-service-editor";

export default async function AdminEditInstitutionServicePage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string; serviceId: string }>; searchParams: Promise<{ view?: string }> }>) {
  const { id, serviceId } = await params;
  // ?view=1 — same page, every control disabled (a claimed org's services are read-only here).
  const { view } = await searchParams;
  return <AdminServiceEditor kind="institution" orgId={Number(id)} serviceId={serviceId} readOnly={view === "1"} />;
}
