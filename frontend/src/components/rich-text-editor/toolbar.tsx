"use client";

import type { ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2, Heading3, Quote,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link2, Image as ImageIcon,
  Table as TableIcon, Code2, Minus, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function ToolbarButton({ active, disabled, label, onClick, children }: Readonly<{
  active?: boolean; disabled?: boolean; label: string; onClick: () => void; children: ReactNode;
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-8 w-8", active && "bg-accent text-accent-foreground")}
    >
      {children}
    </Button>
  );
}

function useToolbarState(editor: Editor | null) {
  return useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) return null;
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        blockquote: e.isActive("blockquote"),
        bulletList: e.isActive("bulletList"),
        orderedList: e.isActive("orderedList"),
        alignLeft: e.isActive({ textAlign: "left" }),
        alignCenter: e.isActive({ textAlign: "center" }),
        alignRight: e.isActive({ textAlign: "right" }),
        code: e.isActive("code"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });
}

function setLink(editor: Editor) {
  const previousUrl = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("URL", previousUrl ?? "");
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
}

function addImage(editor: Editor) {
  const url = window.prompt("Image URL");
  if (url) editor.chain().focus().setImage({ src: url }).run();
}

export function RichTextEditorToolbar({ editor }: Readonly<{ editor: Editor | null }>) {
  const state = useToolbarState(editor);
  if (!editor || !state) return null;

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5">
      <ToolbarButton label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolbarButton>
      <ToolbarButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolbarButton>
      <ToolbarButton label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Heading 2" active={state.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={state.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolbarButton>
      <ToolbarButton label="Blockquote" active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Bullet list" active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolbarButton>
      <ToolbarButton label="Ordered list" active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Align left" active={state.alignLeft} onClick={() => editor.chain().focus().setTextAlign("left").run()}>
        <AlignLeft />
      </ToolbarButton>
      <ToolbarButton label="Align center" active={state.alignCenter} onClick={() => editor.chain().focus().setTextAlign("center").run()}>
        <AlignCenter />
      </ToolbarButton>
      <ToolbarButton label="Align right" active={state.alignRight} onClick={() => editor.chain().focus().setTextAlign("right").run()}>
        <AlignRight />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolbarButton label="Link" onClick={() => setLink(editor)}>
        <Link2 />
      </ToolbarButton>
      <ToolbarButton label="Image" onClick={() => addImage(editor)}>
        <ImageIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolbarButton>
      <ToolbarButton label="Code" active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code2 />
      </ToolbarButton>
      <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus />
      </ToolbarButton>
    </div>
  );
}
