import { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import { splitOutput } from "./codeBlocks";

/** Prism grammar names differ from the tags people write in fences. */
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  console: "bash",
  "c++": "clike",
  c: "clike",
  java: "clike",
};

function highlight(code: string, lang: string): string | null {
  const name = LANG_ALIASES[lang] ?? lang;
  const grammar = Prism.languages[name];
  if (!grammar) return null;
  try {
    return Prism.highlight(code, grammar, name);
  } catch {
    return null;
  }
}

/**
 * Renders AI output, splitting fenced code out of the prose so it can be
 * syntax-highlighted. Plain output renders exactly as before.
 */
export function AiOutput({ text }: { text: string }) {
  const segments = splitOutput(text);

  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <CodeSegment
            key={index}
            code={segment.code}
            lang={segment.lang}
          />
        ) : (
          <p key={index} className="ai-output-prose">
            {segment.text}
          </p>
        ),
      )}
    </>
  );
}

function CodeSegment({ code, lang }: { code: string; lang: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = highlight(code, lang);
    // Only ever assigned Prism's own output over code we already hold as a
    // string; falls back to textContent when there is no grammar for the tag.
    if (html) el.innerHTML = html;
    else el.textContent = code;
  }, [code, lang]);

  return (
    <div className="code-block">
      <div className="code-block-head">
        <span className="code-block-lang">{lang}</span>
      </div>
      <pre className="code-block-pre">
        <code ref={ref} className={`language-${lang}`} />
      </pre>
    </div>
  );
}
