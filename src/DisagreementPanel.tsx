import { summarizeDisagreement, type ModelOutput } from "./disagreement";

type DisagreementPanelProps = {
  open: boolean;
  prompt: string;
  left: ModelOutput;
  right: ModelOutput;
  onClose: () => void;
};

export function DisagreementPanel({
  open,
  prompt,
  left,
  right,
  onClose,
}: DisagreementPanelProps) {
  if (!open) return null;
  const diff = summarizeDisagreement(left, right);

  return (
    <div className="compare-overlay" role="dialog" aria-label="Where models disagree">
      <div className="compare-panel disagreement-panel">
        <div className="compare-header">
          <strong>Where they disagree</strong>
          <button type="button" className="font-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="compare-copy">Prompt: {prompt}</p>
        {diff.alike ? (
          <p className="compare-copy">
            {left.model} and {right.model} said essentially the same thing.
          </p>
        ) : (
          <div className="disagree-grid">
            <section>
              <h3>Only {left.model}</h3>
              {diff.onlyLeft.length === 0 ? (
                <p>No unique claims.</p>
              ) : (
                <ul>
                  {diff.onlyLeft.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3>Only {right.model}</h3>
              {diff.onlyRight.length === 0 ? (
                <p>No unique claims.</p>
              ) : (
                <ul>
                  {diff.onlyRight.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
        {diff.shared.length > 0 ? (
          <section className="disagree-shared">
            <h3>They agree on</h3>
            <ul>
              {diff.shared.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
