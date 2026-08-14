import { BlogEditorView } from "../../components/blog-editor-view";

export default async function EditBlogPostPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <BlogEditorView postId={Number(id)} />;
}
