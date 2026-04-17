import { useLayoutEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/plugins/line-numbers/prism-line-numbers.css";
import "prismjs/plugins/line-numbers/prism-line-numbers.js";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";

export type SourceCodeLanguage = "javascript" | "css" | "json" | "plaintext";

type Props = {
  code: string;
  language: SourceCodeLanguage;
  emptyMessage?: string;
};

function PlainSourceBlock({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div className="source-code-viewer-wrap source-code-viewer-wrap--plain">
      <div className="source-code-plain__gutter" aria-hidden>
        {lines.map((_, i) => (
          <div key={i} className="source-code-plain__ln">
            {i + 1}
          </div>
        ))}
      </div>
      <pre className="source-code-plain__pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function PrismSourceBlock({
  code,
  language,
}: {
  code: string;
  language: Exclude<SourceCodeLanguage, "plaintext">;
}) {
  const preRef = useRef<HTMLPreElement>(null);

  useLayoutEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    const codeEl = pre.querySelector("code");
    if (!codeEl) return;
    codeEl.textContent = code;
    codeEl.className = `language-${language}`;
    Prism.highlightElement(codeEl);
    const ln = (
      Prism.plugins as unknown as {
        lineNumbers?: { resize?: (el: Element) => void };
      }
    ).lineNumbers;
    ln?.resize?.(pre);
  }, [code, language]);

  return (
    <div className="source-code-viewer-wrap">
      <pre ref={preRef} className="line-numbers source-code-viewer">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

export function SourceCodeViewer({
  code,
  language,
  emptyMessage = "Aucun contenu à afficher.",
}: Props) {
  if (!code.trim()) {
    return (
      <p className="muted text-small source-code-viewer__empty">{emptyMessage}</p>
    );
  }

  if (language === "plaintext") {
    return <PlainSourceBlock code={code} />;
  }

  return <PrismSourceBlock code={code} language={language} />;
}
