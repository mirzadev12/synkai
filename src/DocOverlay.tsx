import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import {
  Bold,
  Code,
  FileText,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Quote,
  X,
} from "lucide-react";
import { docTitle } from "./liveblocks.config";

/**
 * Loaded lazily by DocBlock. TipTap/ProseMirror is ~125KB gzipped — more than
 * the rest of the app combined — and most sessions never expand a document, so
 * it must not sit in the initial bundle.
 */
export default function DocOverlay({
  html,
  name,
  onChange,
  onRename,
  onClose,
}: {
  html: string;
  name: string;
  onChange: (next: string) => void;
  onRename: (next: string) => void;
  onClose: () => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    editorProps: {
      attributes: { class: "doc-editor-surface", spellcheck: "true" },
    },
    // Land in the document ready to type, the way a doc editor should.
    // Without this the overlay opened with focus still on <body> and the
    // first keystroke went nowhere.
    autofocus: "end",
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="doc-overlay-scrim"
      onPointerDown={(event) => {
        // Only a click on the scrim itself closes — not one inside the document.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="doc-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Document"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="doc-overlay-header">
          <div className="doc-overlay-title">
            <FileText size={15} strokeWidth={1.7} aria-hidden />
            <input
              className="doc-title-input"
              value={name}
              placeholder={docTitle(html)}
              aria-label="Document title"
              onChange={(event) => onRename(event.target.value)}
              onKeyDown={(event) => {
                // Enter in the title moves into the body, like a doc editor.
                if (event.key === "Enter") {
                  event.preventDefault();
                  editor?.commands.focus("start");
                }
              }}
            />
          </div>
          <button
            type="button"
            className="doc-overlay-close"
            onClick={onClose}
            aria-label="Minimise document"
            title="Minimise (Esc)"
          >
            <X size={16} strokeWidth={1.8} aria-hidden />
          </button>
        </header>

        {editor ? (
          <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
            <ToolbarButton
              label="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Heading"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
            >
              <Heading2 size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <span className="doc-toolbar-split" aria-hidden />
            <ToolbarButton
              label="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <span className="doc-toolbar-split" aria-hidden />
            <ToolbarButton
              label="Quote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
            <ToolbarButton
              label="Code"
              active={editor.isActive("codeBlock")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            >
              <Code size={14} strokeWidth={2} aria-hidden />
            </ToolbarButton>
          </div>
        ) : null}

        <div className="doc-overlay-body">
          <EditorContent editor={editor} />
        </div>

        <footer className="doc-overlay-footer">
          Changes save and sync as you type · Esc to minimise
        </footer>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`doc-toolbar-btn${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
