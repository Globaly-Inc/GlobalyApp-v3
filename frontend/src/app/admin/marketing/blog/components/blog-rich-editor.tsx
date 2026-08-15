"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import DOMPurify from "dompurify";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2, Heading3, Quote, List, ListOrdered,
  Link2, Image as ImageIcon, Minus, Code, Video, Undo, Redo, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ALLOWED_URL = /^(https?:|mailto:)/i;

function ToolbarButton({
  icon: Icon,
  label,
  active,
  onClick,
}: Readonly<{ icon: LucideIcon; label: string; active?: boolean; onClick: () => void }>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", active && "bg-muted text-foreground")}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Toolbar({ editor }: Readonly<{ editor: Editor }>) {
  const handleLink = () => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL (https://, mailto:)");
    if (!url || !ALLOWED_URL.test(url)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const handleImage = () => {
    const url = window.prompt("Image URL");
    if (!url || !/^https?:/i.test(url)) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const handleYoutube = () => {
    const url = window.prompt("YouTube video URL");
    if (!url) return;
    editor.commands.setYoutubeVideo({ src: url });
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/40 p-1">
      <ToolbarButton icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton icon={UnderlineIcon} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <ToolbarButton icon={Strikethrough} label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton icon={Heading2} label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton icon={Heading3} label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <ToolbarButton icon={Quote} label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton icon={List} label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton icon={ListOrdered} label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton icon={Link2} label="Link" active={editor.isActive("link")} onClick={handleLink} />
      <ToolbarButton icon={ImageIcon} label="Image" onClick={handleImage} />
      <ToolbarButton icon={Code} label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <ToolbarButton icon={Minus} label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <ToolbarButton icon={Video} label="YouTube embed" onClick={handleYoutube} />
      <ToolbarButton icon={Undo} label="Undo" onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton icon={Redo} label="Redo" onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

export function BlogRichEditor({ value, onChange }: Readonly<{ value: string; onChange: (html: string) => void }>) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
      Image,
      Youtube.configure({ nocookie: true }),
    ],
    content: DOMPurify.sanitize(value || ""),
    editorProps: {
      attributes: {
        class: cn(
          "min-h-64 max-w-none p-4 text-sm leading-relaxed outline-hidden",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2",
          "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          "[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_a]:text-primary [&_a]:underline",
          "[&_img]:max-w-full [&_img]:rounded-md",
        ),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Re-sync when `value` changes from outside typing (e.g. loading a post for edit) —
  // skip if it already matches the editor's own last emitted HTML, or every keystroke's
  // onUpdate → prop round-trip would reset the cursor to the start.
  useEffect(() => {
    if (!editor || editor.getHTML() === value) return;
    editor.commands.setContent(DOMPurify.sanitize(value || ""), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-input">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
