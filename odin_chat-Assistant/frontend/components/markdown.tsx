import { Fragment } from "react";

function inline(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function SafeMarkdown({ content }: { content: string }) {
  const blocks = content.split(/```/);
  return <div className="markdown">{blocks.map((block, index) => index % 2 ? <pre key={index}><code>{block.replace(/^\w*\n/, "")}</code></pre> : block.split("\n").map((line, lineIndex) => line ? <p key={`${index}-${lineIndex}`}>{inline(line)}</p> : null))}</div>;
}
