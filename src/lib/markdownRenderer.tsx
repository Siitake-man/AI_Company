import React from 'react';

/**
 * 簡易的なMarkdownテキストをパースしてReactノードとして描画するコンポーネント/関数。
 * 外部の重いライブラリへの依存を避け、Tauri内での安全なHTMLレンダリングを実現します。
 */
export function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  // 行ごとに分割してパース
  const lines = text.split("\n");
  
  return (
    <div className="markdown-body flex flex-col gap-1.5" style={{ fontFamily: "'M PLUS Rounded 1c', sans-serif" }}>
      {lines.map((line, idx) => {
        // 見出し (H3)
        if (line.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-sm text-[var(--color-text)] mt-3 mb-1 flex items-center gap-1">
              <span>🔸</span> {parseInline(line.slice(4))}
            </h4>
          );
        }
        // 見出し (H2)
        if (line.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-bold text-md text-[var(--color-border-outer)] mt-4 mb-2 border-b-2 border-[var(--color-border-outer)]/20 pb-1">
              {parseInline(line.slice(3))}
            </h3>
          );
        }
        // 見出し (H1)
        if (line.startsWith("# ")) {
          return (
            <h2 key={idx} className="font-bold text-lg text-[var(--color-text)] mt-5 mb-3 border-b-3 border-[var(--color-border-outer)]/40 pb-1.5">
              {parseInline(line.slice(2))}
            </h2>
          );
        }
        // 箇条書きリスト
        if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
          const content = line.trim().slice(2);
          return (
            <ul key={idx} className="list-disc pl-5 my-0.5 text-xs text-[var(--color-text)] leading-relaxed">
              <li>{parseInline(content)}</li>
            </ul>
          );
        }
        // 番号付きリスト
        if (/^\d+\.\s/.test(line.trim())) {
          const match = line.trim().match(/^(\d+)\.\s(.*)/);
          if (match) {
            return (
              <ol key={idx} className="list-decimal pl-5 my-0.5 text-xs text-[var(--color-text)] leading-relaxed" start={parseInt(match[1])}>
                <li>{parseInline(match[2])}</li>
              </ol>
            );
          }
        }
        // 空行
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />;
        }
        // 通常のテキスト行
        return (
          <p key={idx} className="text-xs leading-relaxed text-[var(--color-text)] my-0.5">
            {parseInline(line)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * 太字 (**bold**) と インラインコード (`code`) を解析して装飾するインラインパーサー。
 */
function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentText = text;
  let keyIdx = 0;

  while (currentText.length > 0) {
    const boldMatch = currentText.match(/\*\*(.*?)\*\*/);
    const codeMatch = currentText.match(/`(.*?)`/);

    // 最も左にあるマッチを特定する
    let matchType: 'bold' | 'code' | null = null;
    let matchIdx = -1;
    let matchLength = 0;
    let matchText = "";

    if (boldMatch && boldMatch.index !== undefined) {
      matchType = 'bold';
      matchIdx = boldMatch.index;
      matchLength = boldMatch[0].length;
      matchText = boldMatch[1];
    }

    if (codeMatch && codeMatch.index !== undefined) {
      if (matchIdx === -1 || codeMatch.index < matchIdx) {
        matchType = 'code';
        matchIdx = codeMatch.index;
        matchLength = codeMatch[0].length;
        matchText = codeMatch[1];
      }
    }

    if (matchType && matchIdx !== -1) {
      // マッチする前の文字列を追加
      if (matchIdx > 0) {
        parts.push(<span key={`text-${keyIdx++}`}>{currentText.slice(0, matchIdx)}</span>);
      }
      // マッチしたトークンをReact装飾エレメントとして追加
      if (matchType === 'bold') {
        parts.push(
          <strong key={`bold-${keyIdx++}`} className="font-bold text-[var(--color-border-outer)] bg-[var(--color-bg)] px-0.5 rounded">
            {matchText}
          </strong>
        );
      } else if (matchType === 'code') {
        parts.push(
          <code key={`code-${keyIdx++}`} className="bg-red-50 border border-red-200 text-red-700 px-1 py-0.2 rounded font-mono text-[10.5px]">
            {matchText}
          </code>
        );
      }
      currentText = currentText.slice(matchIdx + matchLength);
    } else {
      parts.push(<span key={`text-${keyIdx++}`}>{currentText}</span>);
      break;
    }
  }

  return parts;
}
