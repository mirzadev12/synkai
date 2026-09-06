import { useMutation } from "@liveblocks/react/suspense";
import { Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { FileText } from "lucide-react";
import {
  DOC_HEIGHT,
  DOC_WIDTH,
  docPlainText,
  docTitle,
  type BoxData,
} from "./liveblocks.config";

/**
 * The editor is ~125KB gzipped — larger than the rest of the app — and most
 * sessions never expand a document, so it is fetched only when one is opened.
 */
const DocOverlay = lazy(() => import("./DocOverlay"));

type DocBlockProps = {
  id: string;
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  /** Local view state — one person expanding a doc must not open it for everyone. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelect: (event: React.PointerEvent) => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function DocBlock({
  id,
  box,
  dragging,
  selected,
  expanded,
  onExpandedChange,
  onSelect,
  onDragStart,
  onResizeStart,
}: DocBlockProps) {
  const html = box.text ?? "";
  const width = box.width ?? DOC_WIDTH;
  const height = box.height ?? DOC_HEIGHT;

  const updateDoc = useMutation(
    ({ storage }, next: string) => {
      storage.get("boxes").get(id)?.update({ text: next });
    },
    [id],
  );

  const renameDoc = useMutation(
    ({ storage }, next: string) => {
      storage.get("boxes").get(id)?.update({ docName: next });
    },
    [id],
  );

  const body = docPlainText(html);
  const words = body ? body.split(/\s+/).filter(Boolean).length : 0;

  return (
    <>
      <div
        className={`canvas-item doc-block${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
        style={{ width, height }}
        onPointerDown={onSelect}
        onDoubleClick={() => onExpandedChange(true)}
      >
        <div className="doc-block-handle" onPointerDown={onDragStart}>
          <FileText size={13} strokeWidth={1.8} aria-hidden />
          <span className="doc-block-kind">Doc</span>
        </div>
        <button
          type="button"
          className="doc-block-body"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onExpandedChange(true)}
          title="Open document"
        >
          <span className="doc-block-title">{docTitle(html, box.docName)}</span>
          <span className="doc-block-meta">
            {words === 0 ? "Empty" : `${words} word${words === 1 ? "" : "s"}`}
          </span>
        </button>
        <div className="resize-handle" onPointerDown={onResizeStart} />
      </div>

      {/* Portalled to <body>: the block sits inside .item-wrap, which carries a
          transform, and a transformed ancestor becomes the containing block for
          position:fixed descendants — so rendering the overlay in place would
          anchor it to the block instead of the viewport. */}
      {expanded
        ? createPortal(
            <Suspense
              fallback={
                <div className="doc-overlay-scrim">
                  <div className="doc-overlay doc-overlay-loading">
                    Opening the document…
                  </div>
                </div>
              }
            >
              <DocOverlay
                html={html}
                name={box.docName ?? ""}
                onChange={(next) => updateDoc(next)}
                onRename={(next) => renameDoc(next)}
                onClose={() => onExpandedChange(false)}
              />
            </Suspense>,
            document.body,
          )
        : null}
    </>
  );
}
