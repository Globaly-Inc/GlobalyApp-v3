import { CategoryEditorView } from "../../components/category-editor-view";

export default async function EditBusinessCategoryPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <CategoryEditorView kind="business" categoryId={Number(id)} />;
}
