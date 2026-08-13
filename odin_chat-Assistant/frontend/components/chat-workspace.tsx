"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { modelStatus, streamChat } from "@/lib/api";
import { clearConversations, loadConversations, saveConversations } from "@/lib/storage";
import type { Citation, Conversation, Message, ModelStatus } from "@/lib/types";
import { SafeMarkdown } from "./markdown";

const welcome: Message = { id: "welcome", role: "assistant", createdAt: 0, content: "I’m Odin, your local book research companion. Ask about a title, author, reading mood, or what to read next." };

function createConversation(): Conversation {
  return { id: crypto.randomUUID(), title: "New book chat", messages: [welcome], updatedAt: Date.now() };
}

function titleFor(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 42) || "New book chat";
}

function CitationCards({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return <section className="citations" aria-label="Open Library sources"><p>Sources from Open Library</p><div className="citation-grid">{citations.map((citation) => <a className="citation" href={citation.url} target="_blank" rel="noreferrer" key={citation.key}><div className="cover">{citation.cover_url ? <img src={citation.cover_url} alt={`Cover of ${citation.title}`} /> : <span>{citation.title.slice(0, 1)}</span>}</div><span className="citation-copy"><strong>{citation.title}</strong><small>{citation.authors.join(", ") || "Author unavailable"}{citation.year ? ` · ${citation.year}` : ""}</small></span><span aria-hidden="true">↗</span></a>)}</div></section>;
}

export function ChatWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const loaded = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const newest = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // One-time hydration from localStorage on mount. Setting state here is intentional
    // and does not cascade — the effect runs once with an empty dependency array.
    const saved = loadConversations();
    const initial = saved.length ? saved : [createConversation()];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(initial); setActiveId(initial[0].id); loaded.current = true;
    void modelStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => { if (loaded.current) saveConversations(conversations); }, [conversations]);
  useEffect(() => { newest.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conversations, streaming]);

  const active = conversations.find((chat) => chat.id === activeId) ?? conversations[0];
  const visibleConversations = useMemo(() => conversations.filter((chat) => chat.title.toLowerCase().includes(filter.toLowerCase())), [conversations, filter]);

  function updateActive(mutator: (chat: Conversation) => Conversation) {
    setConversations((current) => current.map((chat) => chat.id === activeId ? mutator(chat) : chat));
  }
  function newChat() {
    if (streaming) return;
    const chat = createConversation(); setConversations((current) => [chat, ...current]); setActiveId(chat.id); setInput(""); setNotice(null); setSidebarOpen(false);
  }
  function clearAll() {
    if (!window.confirm("Clear every chat stored in this browser?")) return;
    clearConversations(); const chat = createConversation(); setConversations([chat]); setActiveId(chat.id); setNotice(null);
  }
  function stop() { controller.current?.abort(); controller.current = null; setStreaming(false); setNotice("Response stopped."); }
  async function copy(text: string, id: string) { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(null), 1500); }

  async function send(retryContent?: string) {
    const message = (retryContent ?? input).trim();
    if (!message || streaming || !active) return;
    // send() is an event handler invoked from a click/keypress, not during render,
    // so reading the current clock here is safe.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const user: Message = { id: crypto.randomUUID(), role: "user", content: message, createdAt: now };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: "", createdAt: now + 1 };
    const history = active.messages;
    updateActive((chat) => ({ ...chat, title: chat.messages.length <= 1 ? titleFor(message) : chat.title, updatedAt: now, messages: [...chat.messages, user, assistant] }));
    setInput(""); setNotice(null); setStreaming(true); controller.current = new AbortController();
    const updateAssistant = (change: (entry: Message) => Message) => updateActive((chat) => ({ ...chat, updatedAt: Date.now(), messages: chat.messages.map((entry) => entry.id === assistant.id ? change(entry) : entry) }));
    try {
      await streamChat(message, history, controller.current, {
        onCitations: (citations) => updateAssistant((entry) => ({ ...entry, citations })),
        onToken: (text) => updateAssistant((entry) => ({ ...entry, content: entry.content + text })),
        onNotice: setNotice,
        onError: (error) => { setNotice(error); updateAssistant((entry) => ({ ...entry, error: true, content: entry.content || error })); },
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const text = error instanceof Error ? error.message : "Unable to reach the chat service.";
        setNotice(text); updateAssistant((entry) => ({ ...entry, error: true, content: text }));
      }
    } finally { controller.current = null; setStreaming(false); void modelStatus().then(setStatus).catch(() => setStatus(null)); }
  }
  function onInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }

  if (!active) return null;
  return <main className="app-shell">
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Conversations">
      <div className="brand"><span>◈</span><strong>ODIN</strong><small>BOOK CHAT</small><button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu">×</button></div>
      <button className="new-chat" onClick={newChat}>＋ <span>New chat</span></button>
      <label className="search"><span>⌕</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search chats" aria-label="Search chats" /></label>
      <nav>{visibleConversations.map((chat) => <button key={chat.id} onClick={() => { setActiveId(chat.id); setSidebarOpen(false); }} className={chat.id === active.id ? "active" : ""}><span>◌</span><span>{chat.title}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={clearAll}>⌫ Clear local chats</button><p>Local history only<br />Book data via Open Library</p></div>
    </aside>
    {sidebarOpen ? <button className="scrim" aria-label="Close menu" onClick={() => setSidebarOpen(false)} /> : null}
    <section className="chat-panel">
      <header><button className="menu" onClick={() => setSidebarOpen(true)} aria-label="Open chats">☰</button><div><h1>{active.title}</h1><p>{status?.available ? `${status.configured_model} · ready` : "Local model unavailable"}</p></div><span className={`connection ${status?.available ? "ready" : "offline"}`}>{status?.available ? "Connected" : "Offline"}</span></header>
      <div className="messages" aria-live="polite">{active.messages.map((message) => <article className={`message ${message.role} ${message.error ? "error" : ""}`} key={message.id}><div className="avatar">{message.role === "assistant" ? "◈" : "You"}</div><div className="message-content"><SafeMarkdown content={message.content || "…"} />{message.role === "assistant" && message.content ? <div className="message-actions"><button onClick={() => void copy(message.content, message.id)}>{copied === message.id ? "Copied" : "Copy"}</button>{!streaming && message.error ? <button onClick={() => void send(active.messages.slice(0, active.messages.indexOf(message)).filter((entry) => entry.role === "user").at(-1)?.content)}>Retry</button> : null}</div> : null}<CitationCards citations={message.citations ?? []} /></div></article>)}<div ref={newest} /></div>
      <div className="composer-wrap">{notice ? <p className="notice" role="status">{notice}</p> : null}<div className="composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onInputKeyDown} maxLength={1000} rows={1} placeholder="Ask about a book, author, or your next read…" aria-label="Message Odin" disabled={streaming} /><div><span>Open Library citations · Local model</span>{streaming ? <button className="stop" onClick={stop}>Stop</button> : <button className="send" disabled={!input.trim() || !status?.available} onClick={() => void send()} aria-label="Send message">↑</button>}</div></div><p className="disclaimer">Odin can make mistakes. Open cited sources for book facts. <a href="https://openlibrary.org" target="_blank" rel="noreferrer">Open Library</a></p></div>
    </section>
  </main>;
}
