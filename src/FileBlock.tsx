import { Download, File, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { FILE_HEIGHT, FILE_WIDTH, type BoxData } from "./liveblocks.config";
import { safeLinkUrl } from "./safeUrl";

type FileBlockProps = {
  box: BoxData;
  dragging: boolean;
  selected: boolean;
  onSelect: (event: React.PointerEvent) => void;
  onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
};

function humanSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KindIcon({ type }: { type: string }) {
  if (type.startsWith("image/")) {
    return <ImageIcon size={15} strokeWidth={1.7} aria-hidden />;
  }
  if (type.startsWith("text/") || type.includes("pdf")) {
    return <FileText size={15} strokeWidth={1.7} aria-hidden />;
  }
  return <File size={15} strokeWidth={1.7} aria-hidden />;
}

export function FileBlock({
  box,
  dragging,
  selected,
  onSelect,
  onDragStart,
}: FileBlockProps) {
  const name = box.fileName ?? "File";
  // The URL arrives through shared storage, so it is checked before it becomes
  // an href — see safeUrl.
  const url = safeLinkUrl(box.src);
  // No URL yet means the upload is still in flight on whoever added it.
  const uploading = !box.src;

  return (
    <div
      className={`canvas-item file-block${dragging ? " box-dragging" : ""}${selected ? " item-selected" : ""}`}
      style={{ width: box.width ?? FILE_WIDTH, height: box.height ?? FILE_HEIGHT }}
      onPointerDown={onSelect}
    >
      <div className="file-block-main" onPointerDown={onDragStart}>
        <span className="file-block-icon">
          {uploading ? (
            <Loader2 className="file-block-spin" size={15} strokeWidth={1.7} aria-hidden />
          ) : (
            <KindIcon type={box.fileType ?? ""} />
          )}
        </span>
        <span className="file-block-meta">
          <span className="file-block-name" title={name}>
            {name}
          </span>
          <span className="file-block-size">
            {uploading ? "Uploading…" : humanSize(box.fileSize)}
          </span>
        </span>
      </div>

      {url ? (
        <a
          className="file-block-download"
          href={url}
          download={name}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          title={`Download ${name}`}
        >
          <Download size={13} strokeWidth={1.8} aria-hidden />
          Download
        </a>
      ) : null}
    </div>
  );
}
