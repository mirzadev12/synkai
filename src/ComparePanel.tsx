import { useState } from "react";
import type { AiModel } from "./liveblocks.config";

type ComparePanelProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (prompt: string, models: AiModel[]) => void;
};

const COMING_SOON = ["claude", "midjourney"] as const;

export function ComparePanel({ open, onClose, onCreate }: ComparePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [gemini, setGemini] = useState(true);
  const [groq, setGroq] = useState(true);
  const [comingSoon, setComingSoon] = useState<Record<string, boolean>>({
    claude: false,
    midjourney: false,
  });

  if (!open) return null;

  function submit() {
    const models: AiModel[] = [];
    if (gemini) models.push("gemini");
    if (groq) models.push("groq");
    if (models.length < 2) return;
    onCreate(prompt.trim() || "Compare this idea", models);
    onClose();
  }

  return (
    <div className="compare-overlay" role="dialog" aria-label="Compare models">
      <div className="compare-panel">
        <div className="compare-header">
          <strong>Compare models</strong>
          <button type="button" className="font-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="compare-copy">
          One prompt → multiple AI Blocks side by side, each model runs at once.
        </p>
        <input
          className="ai-prompt"
          type="text"
          placeholder="Shared prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <label className="compare-check">
          <input
            type="checkbox"
            checked={gemini}
            onChange={(event) => setGemini(event.target.checked)}
          />
          Gemini
        </label>
        <label className="compare-check">
          <input
            type="checkbox"
            checked={groq}
            onChange={(event) => setGroq(event.target.checked)}
          />
          Groq
        </label>
        {COMING_SOON.map((name) => (
          <label key={name} className="compare-check compare-soon">
            <input
              type="checkbox"
              checked={Boolean(comingSoon[name])}
              onChange={(event) =>
                setComingSoon((prev) => ({
                  ...prev,
                  [name]: event.target.checked,
                }))
              }
            />
            {name === "claude" ? "Claude" : "Midjourney"} (coming soon)
          </label>
        ))}
        <button
          type="button"
          className="ai-run"
          disabled={(gemini ? 1 : 0) + (groq ? 1 : 0) < 2}
          onClick={submit}
        >
          Create & run
        </button>
      </div>
    </div>
  );
}
