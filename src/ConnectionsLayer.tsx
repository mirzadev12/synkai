import type { BoxData } from "./liveblocks.config";
import {
  curvedPath,
  isConnectableKind,
  itemInputPort,
  itemOutputPort,
  type Point,
} from "./canvasGeometry";
import type { ConnectionBranch } from "./liveblocks.config";

type ConnectionsLayerProps = {
  boxes: Record<string, BoxData>;
  selectedConnectionId: string | null;
  draftFromId: string | null;
  draftBranch: ConnectionBranch;
  draftTo: Point | null;
  onSelectConnection: (id: string) => void;
  onDeleteConnection: (id: string) => void;
};

export function ConnectionsLayer({
  boxes,
  selectedConnectionId,
  draftFromId,
  draftBranch,
  draftTo,
  onSelectConnection,
  onDeleteConnection,
}: ConnectionsLayerProps) {
  const connections = Object.entries(boxes).filter(
    ([, box]) => box.kind === "connection" && box.fromId && box.toId,
  );

  const draftFromBox = draftFromId ? boxes[draftFromId] : undefined;
  const draftFrom =
    draftFromBox && isConnectableKind(draftFromBox.kind)
      ? itemOutputPort(draftFromBox, draftBranch)
      : null;

  return (
    <svg className="connections-layer" aria-hidden>
      {connections.map(([id, conn]) => {
        const fromBox = conn.fromId ? boxes[conn.fromId] : undefined;
        const toBox = conn.toId ? boxes[conn.toId] : undefined;
        if (
          !fromBox ||
          !toBox ||
          !isConnectableKind(fromBox.kind) ||
          !isConnectableKind(toBox.kind)
        ) {
          return null;
        }
        const branch: ConnectionBranch =
          conn.branch === "true" || conn.branch === "false"
            ? conn.branch
            : "default";
        const from = itemOutputPort(fromBox, branch);
        const to = itemInputPort(toBox);
        const selected = selectedConnectionId === id;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        return (
          <g key={id} className={selected ? "connection selected" : "connection"}>
            <path
              d={curvedPath(from, to)}
              className="connection-hit"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectConnection(id);
              }}
            />
            <path
              d={curvedPath(from, to)}
              className="connection-line"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectConnection(id);
              }}
            />
            {selected ? (
              <g
                className="connection-delete"
                transform={`translate(${midX}, ${midY})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onDeleteConnection(id);
                }}
              >
                <circle r="10" />
                <text textAnchor="middle" dominantBaseline="central">
                  ×
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
      {draftFrom && draftTo ? (
        <path
          d={curvedPath(draftFrom, draftTo)}
          className="connection-line connection-draft"
        />
      ) : null}
    </svg>
  );
}
