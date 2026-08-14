import { CategoryEditorView } from "../../components/category-editor-view";

export default async function EditOtherServiceCategoryPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <CategoryEditorView kind="other_service" categoryId={Number(id)} />;
}
