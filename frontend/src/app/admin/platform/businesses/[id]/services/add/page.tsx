import { AdminServiceEditor } from "@/app/admin/platform/businesses/components/services/admin-service-editor";

export default async function AdminAddServicePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <AdminServiceEditor kind="business" orgId={Number(id)} />;
}
