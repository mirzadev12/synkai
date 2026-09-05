# Infinite pan/zoom canvas — design

**Date:** 2026-09-06
**Status:** approved design, not yet implemented
**Scope:** core navigation (pan, zoom, reset) + zoom-to-fit and fit-to-content on load

## Problem

`.canvas` is `overflow: hidden` and item drag is clamped to the canvas rect
(`Canvas.tsx`, drag `onMove`: `maxX = rect.width - width`). The workspace is therefore
exactly the size of the viewer's browser window:

- Two collaborators on different screen sizes have differently sized worlds. An item
  dropped near the right edge on a large display is unreachable on a laptop.
- At 300×340px per AI Block, roughly four blocks fill the space. Building a multi-step
  agent graph is not possible without overlapping blocks.
- "Infinite/pannable canvas" is listed as missing in the feature checklist and is the
  single biggest structural cap on the product.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Rendering | CSS transform on a world wrapper | Items are interactive React components (textarea, select, composer); a `<canvas>`/WebGL engine cannot host them. Manual per-item offsetting re-renders every item per frame instead of one GPU-composited transform. |
| Viewport ownership | Per-user, persisted to `localStorage` per room | Matches Figma/Miro/tldraw. Keeps the change entirely client-side — no Liveblocks schema change and no high-frequency wheel/drag traffic in shared storage. |
| Restore behaviour | Stored viewport if present, else fit-to-content | Existing boards have all items packed near the origin; without fit-to-content an old board can open on empty space. |
| Zoom range | 0.1 – 4.0 (10% – 400%) | |
| Culling | Not implemented | Not needed at current item counts. Addable within this approach later without redesign. |

## Architecture

### Two coordinate spaces

- **Screen space** — client coordinates relative to the canvas rect. Home of the
  toolbar, tool dock, pen bar, side panels, zoom controls, the marquee rectangle, and
  the trash bin.
- **World space** — the infinite plane. Home of `box.x` / `box.y`, stroke points, and
  connection port geometry.

Rule: **world for content, screen for chrome.**

### DOM structure

```
.canvas                    clips (overflow:hidden), owns pointer handlers, screen space
  ├ .canvas-world          position:absolute; inset:0; transform-origin:0 0;
  │                        transform: translate(vx,vy) scale(z)
  │   ├ <ConnectionsLayer/>   SVG, overflow:visible
  │   └ item wrappers         transform: translate(box.x, box.y) — unchanged
  ├ .marquee-rect          screen space
  └ .trash-bin             screen space
```

`.canvas-world` must be positioned: `.item-wrap` and `.box` are
`position:absolute; top:0; left:0` and currently resolve against `.canvas`; the wrapper
becomes their new containing block. With `transform-origin: 0 0` and items placed by
transform from `0,0`, the composition is a plain affine transform with no centering
correction.

### Why connections and strokes need no changes

`ConnectionsLayer` renders inside the world wrapper, so its internal coordinate system
*is* world space — exactly what `itemOutputPort()` and `curvedPath()` already emit.
`overflow: visible` is already set on `.connections-layer`, so paths draw outside the
wrapper box. **`canvasGeometry.ts` is not modified by this work.**

### New modules

Extracted rather than added to `Canvas.tsx` (already 1,682 lines and handling tools,
drag, resize, draw, link, selection and workflow execution):

**`src/viewport.ts`** — pure, React-free, unit-testable:

```ts
export type Viewport = { x: number; y: number; zoom: number };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const IDENTITY: Viewport = { x: 0, y: 0, zoom: 1 };

screenToWorld(p: Point, vp: Viewport): Point   // (p - pan) / zoom
worldToScreen(p: Point, vp: Viewport): Point   // p * zoom + pan
clampZoom(z: number): number
zoomAroundPoint(vp, screenPt, factor): Viewport // keeps the world point under the cursor fixed
fitToContent(boxes, rect): Viewport
```

`p` is already canvas-relative (rect origin subtracted by the caller).

**`src/useViewport.ts`** — the hook: state, debounced persistence, pan/zoom actions.

## State and persistence

- React state in `Canvas.tsx` via `useViewport(roomId)`. **Never written to Liveblocks** —
  the viewport is presentation-only.
- Persisted to `localStorage` under `synkai-viewport-<roomId>` (`roomId` already exists on
  `ServerSession`), debounced ~200ms so wheel ticks don't hammer storage.
- On mount: read stored viewport; if absent or malformed, run `fitToContent`.

### fitToContent

- Bounds over all items except `kind === "connection"`, using the existing `getItemSize()`.
- **Strokes are a special case.** `startStroke` sets `x: 0, y: 0` and stores *absolute*
  world coordinates in `points`. Stroke bounds must come from
  `parseStrokePoints()` + `boundsOfPoints()`, not from `x/y/width/height`.
- Empty canvas → `IDENTITY`.
- Otherwise: pad bounds by 64px, compute the zoom that fits the canvas rect, clamp to
  `[MIN_ZOOM, 1]` — never zoom *in* past 100%, which looks broken on a near-empty board —
  then centre.

## Interaction model

**Pan:** space held + drag (cursor `grabbing`), middle-mouse drag, trackpad two-finger
scroll (wheel without `ctrlKey`, pan by `deltaX/deltaY`).

**Zoom:** `ctrl`/`cmd` + wheel, zooming around the cursor (this is also what a trackpad
pinch emits). Screen-fixed zoom controls bottom-right: `−`, percentage readout, `+`,
plus **Fit** and **100%**.

Keyboard zoom shortcuts are deliberately deferred (YAGNI; they also require intercepting
browser zoom).

### Changes in `Canvas.tsx`

All screen↔canvas conversion currently funnels through four `getBoundingClientRect`
sites. That is the entire blast radius.

| Site | Change |
|---|---|
| `canvasPoint()` | Split into `screenPoint()` (raw, canvas-relative) and `worldPoint()` (converted). Pen, eraser, link cursor and marquee origin use `worldPoint`. |
| `isOverTrash()` | Logic unchanged, but must be fed a **screen** point. Converting it makes the bin drift out of the corner as you pan. |
| drag `onMove` | Convert to world; **delete the `maxX`/`maxY` clamp** — this is the change that makes the canvas infinite. Deltas scale correctly for free because origin and current are both world points. |
| drag `onUp` | Trash hit-test with a screen point. |

**Marquee selection — deliberate split.** The marquee **draws** in screen space and
**hit-tests** in world space. Today both are the same space, so this divergence is easy
to miss: `onCanvasPointerDown` records the origin and current point for *both* the
rectangle's `left/top/width/height` and the box-intersection test. After this change the
rectangle keeps using screen points (so its border stays a crisp 1px at any zoom) while
the intersection test must convert both corners with `screenToWorld` before comparing
against `box.x` / `box.y`. Drawing it inside the world instead would scale its border
with zoom, which is why it stays screen-side.

Additional call sites:

- **Resize** (`onMove`, currently raw `clientX` deltas): divide by zoom. At 50% zoom a
  100px mouse movement must resize by 200 world px.
- **Item spawn positions** (`addBox`, `addAiBlock`, `addSticky`, `addShape`, `addText`,
  `addImageFromSrc`, `addWorkflowNode`, `addCompareBlocks`): currently fixed offsets like
  `48 + (count * 24) % 280` near the world origin. Change to the **centre of the current
  viewport in world coordinates**, keeping the existing cascade offset. Otherwise items
  created after panning spawn off-screen.
- **`eraseAtPoint`**: `ERASER_RADIUS` is in world units, so the eraser shrinks on screen
  as you zoom out. Divide by zoom so it stays a constant on-screen size.

### CSS

- `.canvas-world` — the transform wrapper described above.
- Background grid stays on `.canvas`, driven from the viewport:
  `background-position: vx vy`, `background-size: calc(20px * z)`. Keeps the grid
  infinite without a giant element.
- Expose zoom as a CSS custom property on the world (`--zoom`) so selection chrome can
  compensate: `.item-wrap.item-selected { outline-width: calc(2px / var(--zoom)); }`.
  A 2px outline should not render 8px thick at 400%.
- Round the pan translate to whole pixels to limit text blur. Blur from fractional
  *scale* is inherent to zooming and is accepted.

## Error handling and edge cases

- Malformed/absent stored viewport → fall back to `fitToContent`; never throw.
- `localStorage` unavailable (private mode, quota) → wrap in try/catch, degrade to
  in-memory only. Matches the existing pattern in `serverSession.ts` / `ThemeToggle.tsx`.
- Zoom clamped at both ends; `zoomAroundPoint` must not divide by zero.
- Stroke width scales with zoom — correct, a drawn line is part of the world.
- Zoom changing mid-drag stays consistent because the drag origin is stored in world space.

## Testing

**Unit (`viewport.ts`, pure functions):**

- `screenToWorld` / `worldToScreen` round-trip for a spread of pans and zooms.
- `zoomAroundPoint` keeps the world point under the cursor fixed (the property that makes
  zoom feel correct).
- `clampZoom` respects both bounds.
- `fitToContent`: empty canvas → identity; single item; widely spread items; a
  **stroke-only** canvas (the `x:0,y:0` special case); never returns zoom > 1.

**Manual, in-browser:**

- Pan, then create an AI Block — it appears in view.
- Draw a stroke at 200%, erase it at 50%.
- Drag a block onto the trash at 300% zoom while panned away from the origin.
- Create a connection between two blocks that are far apart across a pan.
- Marquee-select at 50% zoom.
- Reload — viewport is restored.
- Open a room created *before* this change — fit-to-content frames the existing items.

**Regression (the important one):**

- Two browser tabs in the same room at *different* zoom levels must show items at
  identical world positions, and dragging in one must land correctly in the other. This
  proves the viewport stayed presentation-only and never leaked into shared storage.

## Out of scope

Minimap, follow-a-collaborator, viewport culling, keyboard zoom shortcuts, zoom-to-selection.
