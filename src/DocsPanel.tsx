type DocsPanelProps = {
  open: boolean;
  onClose: () => void;
};

export function DocsPanel({ open, onClose }: DocsPanelProps) {
  if (!open) return null;

  return (
    <aside className="team-memory-panel docs-panel" aria-label="Docs">
      <div className="team-memory-header">
        <strong>Docs</strong>
        <button type="button" className="team-memory-close" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="team-memory-sub">
        Quick usage notes for the canvas. Edit this copy anytime.
      </p>
      <div className="docs-body">
        <h3>Add items</h3>
        <p>
          Use the left tool dock: AI Agent, notes, shapes, text, images, and
          the pen/eraser. Drag items to move them. Drag onto the trash corner
          to delete, or use the keyboard delete key.
        </p>
        <h3>Run an AI Block</h3>
        <p>
          Pick Gemini or Groq, type a prompt in the chat input, then Send.
          Claude and Midjourney show a coming-soon notice. Nearby sticky notes
          and Team Memory are added as extra context automatically.
        </p>
        <h3>Connect blocks</h3>
        <p>
          Drag from an output handle to another block’s input. The target
          prompt fills from the source output. You still click Send — nothing
          auto-chains.
        </p>
        <h3>Compare mode</h3>
        <p>
          Use Compare in the header. One prompt creates side-by-side AI Blocks
          for each live model.
        </p>
        <h3>Team Memory</h3>
        <p>
          Successful runs are logged. Open Memory in the header for a
          newest-first history shared across the workspace.
        </p>
      </div>
    </aside>
  );
}
