import { BusinessOrInstitutionDetailView } from "../components/business-or-institution-detail-view";

export default async function AdminBusinessDetailPage({
  params,
  searchParams,
}: Readonly<{ params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }> }>) {
  const [{ id }, { kind }] = await Promise.all([params, searchParams]);
  const resolvedKind = kind === "institution" ? "institution" : kind === "business" ? "business" : undefined;
  return <BusinessOrInstitutionDetailView id={Number(id)} kind={resolvedKind} />;
}
