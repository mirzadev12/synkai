import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useWorkspace } from "./WorkspaceContext";

/**
 * Warns when the database is missing a migration.
 *
 * Without this, an unapplied migration looks like a broken feature: the button
 * is there, the code is right, and the table simply does not exist. That
 * happened three times on this project before anyone spotted the cause.
 */
export function SchemaWarning() {
  const { missingMigrations } = useWorkspace();
  const [dismissed, setDismissed] = useState(false);

  const missing = missingMigrations ?? [];
  if (dismissed || missing.length === 0) return null;

  return (
    <div className="schema-warning" role="status">
      <AlertTriangle size={15} strokeWidth={1.8} aria-hidden />
      <div className="schema-warning-body">
        <strong className="schema-warning-title">
          {missing.length === 1
            ? "A database migration hasn't been applied"
            : `${missing.length} database migrations haven't been applied`}
        </strong>
        <p className="schema-warning-copy">
          {missing.map((m) => m.feature).join(", ")}{" "}
          {missing.length === 1 ? "will not work" : "will not work"} until you
          run{" "}
          {missing.map((m, index) => (
            <span key={m.migration}>
              <code>{m.migration}</code>
              {index < missing.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          in the Supabase SQL editor.
        </p>
      </div>
      <button
        type="button"
        className="schema-warning-close"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <X size={14} strokeWidth={1.9} aria-hidden />
      </button>
    </div>
  );
}
