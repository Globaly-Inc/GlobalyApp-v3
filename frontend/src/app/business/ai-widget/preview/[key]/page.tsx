import { WidgetPreviewView } from "../../components/widget-preview-view";

export default async function WidgetPreviewPage({ params }: Readonly<{ params: Promise<{ key: string }> }>) {
  const { key } = await params;
  return <WidgetPreviewView embedKey={key} />;
}
