import { CountryEditorView } from "../../components/country-editor-view";

export default async function EditCountryPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <CountryEditorView countryId={Number(id)} />;
}
