import React, { Fragment, useState } from "react";
import type { Citation } from "@/lib/types";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "./icons";

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-block-lang">{language || "text"}</span>
        <button
          className="code-block-copy"
          onClick={copyCode}
          aria-label="Copy code"
          type="button"
        >
          {copied ? (
            <>
              <CheckIcon size={13} className="text-emerald" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <CopyIcon size={13} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code.trim()}</code>
      </pre>
    </div>
  );
}

function linkifyText(text: string, keyPrefix: string) {
  // Regex to match plain URLs like https://... or http://...
  const urlRegex = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'\]])/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(/^https?:\/\//)) {
      return (
        <a
          key={`${keyPrefix}-url-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="markdown-link auto-link"
        >
          <span>{part}</span>
          <ExternalLinkIcon size={11} className="inline-ext-icon" />
        </a>
      );
    }
    return <Fragment key={`${keyPrefix}-txt-${index}`}>{part}</Fragment>;
  });
}

function inline(text: string, citations?: Citation[], messageId?: string) {
  // Split on markdown code, bold, italic, markdown links [title](url), or citation references [1], [2]
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\)|\[\d+(?:,\s*\d+)*\])/g;

  return text.split(regex).map((part, index) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2 && !part.startsWith("**")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }

    // Markdown link [Title](https://...)
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a
          key={index}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="markdown-link"
        >
          <span>{link[1]}</span>
          <ExternalLinkIcon size={11} className="inline-ext-icon" />
        </a>
      );
    }

    // Citation markers [1], [2], [1, 2]
    const citationMatch = part.match(/^\[(\d+(?:,\s*\d+)*)\]$/);
    if (citationMatch) {
      const nums = citationMatch[1].split(",").map((n) => parseInt(n.trim(), 10));
      return (
        <span key={index} className="citation-pill-group">
          {nums.map((num) => {
            const cit = citations && citations[num - 1];
            const title = cit ? cit.title : `Source [${num}]`;
            const url = cit?.url;
            return (
              <a
                key={num}
                className="citation-pill"
                href={url || (messageId ? `#source-${messageId}-${num}` : undefined)}
                target={url ? "_blank" : undefined}
                rel="noreferrer"
                title={title}
              >
                [{num}]
              </a>
            );
          })}
        </span>
      );
    }

    // Auto-linkify any raw URLs in plain text chunks
    return linkifyText(part, `inline-${index}`);
  });
}

function parseMarkdownBlocks(content: string, citations?: Citation[], messageId?: string) {
  // Split on code fences ```lang ... ```
  const codeFenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  const blocks: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeFenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = content.slice(lastIndex, match.index);
      blocks.push(
        <div key={`text-${lastIndex}`} className="prose-chunk">
          {renderTextParagraphs(textChunk, citations, messageId)}
        </div>
      );
    }
    const lang = match[1];
    const code = match[2];
    blocks.push(<CodeBlock key={`code-${match.index}`} code={code} language={lang} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const textChunk = content.slice(lastIndex);
    blocks.push(
      <div key={`text-${lastIndex}`} className="prose-chunk">
        {renderTextParagraphs(textChunk, citations, messageId)}
      </div>
    );
  }

  return blocks;
}

function renderTextParagraphs(text: string, citations?: Citation[], messageId?: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inList: "ul" | "ol" | null = null;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      if (inList === "ul") {
        elements.push(<ul key={`ul-${elements.length}`}>{listItems}</ul>);
      } else {
        elements.push(<ol key={`ol-${elements.length}`}>{listItems}</ol>);
      }
      listItems = [];
      inList = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      flushList();
      return;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={idx}>{inline(trimmed.slice(4), citations, messageId)}</h3>);
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={idx}>{inline(trimmed.slice(3), citations, messageId)}</h2>);
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(<h1 key={idx}>{inline(trimmed.slice(2), citations, messageId)}</h1>);
      return;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote key={idx}>{inline(trimmed.slice(2), citations, messageId)}</blockquote>
      );
      return;
    }

    // Unordered list item (- or *)
    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== "ul") {
        flushList();
        inList = "ul";
      }
      listItems.push(<li key={`li-${idx}`}>{inline(ulMatch[1], citations, messageId)}</li>);
      return;
    }

    // Ordered list item (1. 2. etc)
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== "ol") {
        flushList();
        inList = "ol";
      }
      listItems.push(<li key={`li-${idx}`}>{inline(olMatch[1], citations, messageId)}</li>);
      return;
    }

    // Normal paragraph
    flushList();
    elements.push(<p key={idx}>{inline(line, citations, messageId)}</p>);
  });

  flushList();
  return elements;
}

export function SafeMarkdown({
  content,
  citations,
  messageId,
}: {
  content: string;
  citations?: Citation[];
  messageId?: string;
}) {
  return <div className="markdown-body">{parseMarkdownBlocks(content, citations, messageId)}</div>;
}
