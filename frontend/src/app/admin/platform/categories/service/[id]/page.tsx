import { CategoryEditorView } from "../../components/category-editor-view";

export default async function EditServiceCategoryPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <CategoryEditorView kind="service" categoryId={Number(id)} />;
}
