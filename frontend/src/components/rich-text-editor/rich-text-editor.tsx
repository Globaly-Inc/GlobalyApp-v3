"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table/kit";
import { cn } from "@/lib/utils";
import { RichTextEditorToolbar } from "./toolbar";

export function RichTextEditor({
  value,
  onChange,
  readOnly = false,
  className,
}: Readonly<{
  value: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  className?: string;
}>) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image,
      TableKit.configure({ table: { resizable: true } }),
    ],
    content: value,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => onChange(updatedEditor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) editor.commands.setContent(value, { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className={cn("rounded-lg border border-input", className)}>
      {!readOnly && (
        <>
          <RichTextEditorToolbar editor={editor} />
          <div className="border-t border-input" />
        </>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          "prose prose-sm dark:prose-invert max-w-none p-3",
          "[&_.ProseMirror]:min-h-[240px] [&_.ProseMirror]:outline-none",
        )}
      />
    </div>
  );
}
