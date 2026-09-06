import { useOthers } from "@liveblocks/react/suspense";
import { colorForUser } from "./userName";

/**
 * Other people's pointers, drawn in canvas coordinates.
 *
 * Deliberately its own component: useOthers() re-renders on every presence
 * change, and presence changes ~60×/sec while anyone is moving. Keeping the
 * subscription here means Canvas — which owns drag, draw, selection and the
 * whole item list — does not re-render on someone else's mouse movement.
 *
 * Positions arrive throttled by LiveblocksProvider's `throttle` setting, so
 * they land in discrete steps; the CSS transition smooths between them.
 */
export function Cursors() {
  const others = useOthers();

  return (
    <div className="cursor-layer" aria-hidden>
      {others.map((user) => {
        const cursor = user.presence?.cursor;
        if (!cursor) return null;
        // Same identity → colour mapping used by the presence chips and
        // creator badges, so a person is one colour everywhere in the app.
        const color = colorForUser(String(user.connectionId));
        const name = (user.presence?.name ?? "").trim() || "Guest";
        return (
          <div
            key={user.connectionId}
            className="cursor"
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          >
            <svg
              className="cursor-arrow"
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
            >
              <path
                d="M3 2.5 14 8.2l-4.6 1.3-2 4.5z"
                fill={color}
                stroke="var(--surface)"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
            </svg>
            <span className="cursor-label" style={{ background: color }}>
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
