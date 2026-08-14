"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { modelStatus, streamChat } from "@/lib/api";
import { clearConversations, loadConversations, saveConversations } from "@/lib/storage";
import type { Citation, Conversation, Message, ModelStatus } from "@/lib/types";
import {
  ArrowUpIcon,
  BookOpenIcon,
  BrainIcon,
  CheckIcon,
  CompassIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LayersIcon,
  MenuIcon,
  MessageSquareIcon,
  PanelLeftIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  TrashIcon,
  TrophyIcon,
  UserIcon,
  XIcon,
} from "./icons";
import { SafeMarkdown } from "./markdown";

const SUGGESTIONS = [
  {
    icon: <SparklesIcon size={16} className="text-emerald" />,
    title: "2025 & 2026 Releases",
    subtitle: "What are the most anticipated sci-fi & fantasy novels releasing recently?",
    prompt: "What are the most anticipated sci-fi and fantasy books released in 2025 and 2026?",
  },
  {
    icon: <CompassIcon size={16} className="text-blue" />,
    title: "Space Opera Classics",
    subtitle: "Recommend sweeping space operas with deep lore like Dune or The Expanse",
    prompt: "Recommend me great space opera novels with rich worldbuilding and political intrigue.",
  },
  {
    icon: <LayersIcon size={16} className="text-amber" />,
    title: "Books Like...",
    subtitle: "Find psychological thrillers with shocking twists and unreliable narrators",
    prompt: "Recommend me gripping psychological thriller books with unexpected plot twists and deep tension.",
  },
  {
    icon: <TrophyIcon size={16} className="text-yellow" />,
    title: "Award Winners",
    subtitle: "Discover recent Hugo, Nebula, and Booker Prize winning books",
    prompt: "What are some recent literary award-winning novels (Hugo, Nebula, Booker) worth reading?",
  },
];

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    messages: [],
    updatedAt: Date.now(),
  };
}

function titleFor(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 36) || "Book chat";
}

function groupConversationsByDate(conversations: Conversation[]) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];

  conversations.forEach((chat) => {
    const diff = now - chat.updatedAt;
    if (diff < oneDay) {
      groups[0].items.push(chat);
    } else if (diff < 2 * oneDay) {
      groups[1].items.push(chat);
    } else if (diff < 7 * oneDay) {
      groups[2].items.push(chat);
    } else {
      groups[3].items.push(chat);
    }
  });

  return groups.filter((g) => g.items.length > 0);
}

function CitationCards({
  citations,
  content = "",
  messageId = "",
}: {
  citations: Citation[];
  content?: string;
  messageId?: string;
}) {
  if (!citations.length) return null;

  // Find [1], [2] citation references mentioned in the content
  const citedNumbers = Array.from(content.matchAll(/\[(\d+)\]/g))
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n >= 1 && n <= citations.length);
  const citedSet = new Set(citedNumbers);

  const indexed = citations.map((citation, i) => ({
    citation,
    index: i + 1,
    isCited: citedSet.has(i + 1),
  }));

  const displayList =
    citedSet.size > 0 ? indexed.filter((item) => item.isCited) : indexed;

  if (!displayList.length) return null;

  return (
    <div className="citations-container" aria-label="Sources & References">
      <div className="citations-header">
        <BookOpenIcon size={14} className="citations-title-icon" />
        <span className="citations-title-text">
          Sources & References {citedSet.size > 0 ? `(${displayList.length} cited)` : `(${displayList.length})`}
        </span>
      </div>
      <div className="citation-grid">
        {displayList.map(({ citation, index }) => {
          const isRAG = citation.key.startsWith("rag_");
          const isWeb = citation.key.startsWith("web_");
          const cardId = `source-${messageId}-${index}`;

          if (isRAG) {
            const source = String(citation.facts?.source || "Unknown document");
            const textRaw = citation.facts?.text;
            const text = typeof textRaw === "string" ? textRaw.slice(0, 240) : "";
            return (
              <div className="citation-card rag-card" key={citation.key} id={cardId}>
                <div className="card-top">
                  <span className="source-index-badge">[{index}]</span>
                  <span className="source-type-pill rag-pill">RAG Knowledge</span>
                </div>
                <div className="card-body">
                  <h4 className="card-title">{citation.title || "Personal note"}</h4>
                  <p className="card-domain">{source}</p>
                  {text && (
                    <details className="card-excerpt">
                      <summary>View snippet</summary>
                      <pre>{text}</pre>
                    </details>
                  )}
                </div>
              </div>
            );
          }

          if (isWeb) {
            const source = String(citation.facts?.source || "Web Search");
            const snippet = String(citation.facts?.snippet || "");
            return (
              <a
                className="citation-card web-card"
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                key={citation.key}
                id={cardId}
              >
                <div className="card-top">
                  <span className="source-index-badge">[{index}]</span>
                  <span className="source-type-pill web-pill">
                    <GlobeIcon size={11} />
                    <span>Web</span>
                  </span>
                  <ExternalLinkIcon size={12} className="card-link-icon" />
                </div>
                <div className="card-body">
                  <h4 className="card-title" title={citation.title}>
                    {citation.title}
                  </h4>
                  <p className="card-domain">{source}</p>
                  {snippet && <p className="card-snippet">{snippet.slice(0, 95)}...</p>}
                </div>
              </a>
            );
          }

          return (
            <a
              className="citation-card book-card"
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              key={citation.key}
              id={cardId}
            >
              <div className="card-top">
                <span className="source-index-badge">[{index}]</span>
                <span className="source-type-pill book-pill">
                  <BookOpenIcon size={11} />
                  <span>Catalog</span>
                </span>
                <ExternalLinkIcon size={12} className="card-link-icon" />
              </div>
              <div className="card-book-content">
                <div className="book-cover-wrap">
                  {citation.cover_url ? (
                    <img src={citation.cover_url} alt={`Cover of ${citation.title}`} />
                  ) : (
                    <div className="book-cover-fallback">{citation.title.slice(0, 1)}</div>
                  )}
                </div>
                <div className="card-body">
                  <h4 className="card-title" title={citation.title}>
                    {citation.title}
                  </h4>
                  <p className="card-author">
                    {citation.authors.join(", ") || "Author unknown"}
                    {citation.year ? ` · ${citation.year}` : ""}
                  </p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export function ChatWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showThinking, setShowThinking] = useState<Record<string, boolean>>({});
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  const loaded = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const saved = loadConversations();
    const initial = saved.length ? saved : [createConversation()];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(initial);
    setActiveId(initial[0].id);
    loaded.current = true;

    void modelStatus().then(setStatus).catch(() => setStatus(null));

    try {
      const savedThinking = localStorage.getItem("odin_thinking_enabled");
      if (savedThinking !== null) setThinkingEnabled(savedThinking === "true");
      const savedShowThinking = localStorage.getItem("odin_show_thinking");
      if (savedShowThinking !== null) setShowThinking(JSON.parse(savedShowThinking));
      const savedWeb = localStorage.getItem("odin_web_search_enabled");
      if (savedWeb !== null) setWebSearchEnabled(savedWeb === "true");
    } catch {}
  }, []);

  useEffect(() => {
    if (loaded.current) saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (loaded.current) localStorage.setItem("odin_thinking_enabled", String(thinkingEnabled));
  }, [thinkingEnabled]);

  useEffect(() => {
    if (loaded.current) localStorage.setItem("odin_web_search_enabled", String(webSearchEnabled));
  }, [webSearchEnabled]);

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversations, streaming]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 44), 200);
    el.style.height = `${nextHeight}px`;
  }, [input]);

  // Keyboard shortcut Ctrl+K / Cmd+K for new chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        newChat();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [streaming]);

  const active = conversations.find((chat) => chat.id === activeId) ?? conversations[0];
  const toggleThinking = (messageId: string) =>
    setShowThinking((prev) => ({ ...prev, [messageId]: !prev[messageId] }));

  const filteredConversations = useMemo(
    () =>
      conversations.filter((chat) =>
        chat.title.toLowerCase().includes(searchFilter.toLowerCase())
      ),
    [conversations, searchFilter]
  );

  const groupedChats = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  function updateActive(mutator: (chat: Conversation) => Conversation) {
    setConversations((current) =>
      current.map((chat) => (chat.id === activeId ? mutator(chat) : chat))
    );
  }

  function newChat() {
    if (streaming) return;
    const chat = createConversation();
    setConversations((current) => [chat, ...current]);
    setActiveId(chat.id);
    setInput("");
    setNotice(null);
    setMobileSidebarOpen(false);
    textareaRef.current?.focus();
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const remaining = conversations.filter((c) => c.id !== id);
    if (!remaining.length) {
      const fresh = createConversation();
      setConversations([fresh]);
      setActiveId(fresh.id);
    } else {
      setConversations(remaining);
      if (activeId === id) {
        setActiveId(remaining[0].id);
      }
    }
  }

  function clearAll() {
    if (!window.confirm("Clear all conversation history stored in this browser?")) return;
    clearConversations();
    const chat = createConversation();
    setConversations([chat]);
    setActiveId(chat.id);
    setNotice(null);
  }

  function stop() {
    controller.current?.abort();
    controller.current = null;
    setStreaming(false);
    setNotice("Generation stopped.");
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  }

  async function send(contentToSend?: string) {
    const message = (contentToSend ?? input).trim();
    if (!message || streaming || !active) return;

    const now = Date.now();
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: now,
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: now + 1,
    };

    const history = active.messages;

    updateActive((chat) => ({
      ...chat,
      title: chat.messages.length === 0 ? titleFor(message) : chat.title,
      updatedAt: now,
      messages: [...chat.messages, userMsg, assistantMsg],
    }));

    setInput("");
    setNotice(null);
    setStreaming(true);
    controller.current = new AbortController();

    const updateAssistant = (change: (entry: Message) => Message) =>
      updateActive((chat) => ({
        ...chat,
        updatedAt: Date.now(),
        messages: chat.messages.map((entry) =>
          entry.id === assistantMsg.id ? change(entry) : entry
        ),
      }));

    try {
      await streamChat(
        message,
        history,
        controller.current,
        {
          onCitations: (citations) => updateAssistant((entry) => ({ ...entry, citations })),
          onToken: (text) =>
            updateAssistant((entry) => ({ ...entry, content: entry.content + text })),
          onThinking: (text) =>
            updateAssistant((entry) => ({
              ...entry,
              thinking: (entry.thinking || "") + text,
            })),
          onNotice: setNotice,
          onError: (err) => {
            setNotice(err);
            updateAssistant((entry) => ({
              ...entry,
              error: true,
              content: entry.content || err,
            }));
          },
        },
        thinkingEnabled
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const text = error instanceof Error ? error.message : "Service temporarily unavailable.";
        setNotice(text);
        updateAssistant((entry) => ({ ...entry, error: true, content: text }));
      }
    } finally {
      controller.current = null;
      setStreaming(false);
      void modelStatus().then(setStatus).catch(() => setStatus(null));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (!active) return null;

  const isNewChat = active.messages.length === 0;

  return (
    <div className={`chat-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* ── Mobile Scrim ── */}
      {mobileSidebarOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`chat-sidebar ${mobileSidebarOpen ? "mobile-open" : ""}`}
        aria-label="Chat History"
      >
        <div className="sidebar-header">
          <div className="brand-badge">
            <div className="brand-logo">
              <BookOpenIcon size={17} className="text-emerald" />
            </div>
            <div className="brand-text">
              <strong>Odin</strong>
              <span className="brand-sub">Book Intelligence</span>
            </div>
          </div>
          <button
            className="icon-btn close-sidebar-btn"
            onClick={() => {
              setSidebarCollapsed(true);
              setMobileSidebarOpen(false);
            }}
            title="Close sidebar"
            type="button"
          >
            <XIcon size={16} />
          </button>
        </div>

        <div className="sidebar-actions">
          <button className="new-chat-btn" onClick={newChat} type="button">
            <PlusIcon size={15} className="plus-icon" />
            <span className="new-chat-label">New chat</span>
            <kbd className="shortcut-kbd">⌘K</kbd>
          </button>
        </div>

        <div className="sidebar-search-box">
          <SearchIcon size={14} className="search-icon" />
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
          />
          {searchFilter && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchFilter("")}
              type="button"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>

        <div className="sidebar-history-scroll">
          {groupedChats.map((group) => (
            <div className="history-group" key={group.label}>
              <div className="history-group-title">{group.label}</div>
              <div className="history-group-list">
                {group.items.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => {
                      setActiveId(chat.id);
                      setMobileSidebarOpen(false);
                    }}
                    className={`history-item ${chat.id === active.id ? "active" : ""}`}
                    role="button"
                    tabIndex={0}
                  >
                    <MessageSquareIcon size={14} className="history-item-icon" />
                    <span className="history-item-title">{chat.title}</span>
                    <button
                      className="history-item-delete"
                      onClick={(e) => deleteConversation(chat.id, e)}
                      title="Delete chat"
                      type="button"
                    >
                      <TrashIcon size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {groupedChats.length === 0 && (
            <div className="empty-history">
              <p>No conversations found</p>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="clear-all-btn" onClick={clearAll} type="button">
            <TrashIcon size={13} />
            <span>Clear all history</span>
          </button>
          <div className="sidebar-capabilities-badge">
            <span className="cap-dot active" />
            <span>Open Library & Live Web Engine</span>
          </div>
        </div>
      </aside>

      {/* ── Main Chat Area ── */}
      <main className="chat-main">
        {/* Top Navbar */}
        <header className="chat-navbar">
          <div className="navbar-left">
            <button
              className="icon-btn sidebar-toggle-btn"
              onClick={() => {
                if (window.innerWidth <= 768) {
                  setMobileSidebarOpen(true);
                } else {
                  setSidebarCollapsed(!sidebarCollapsed);
                }
              }}
              title={sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
              type="button"
            >
              {sidebarCollapsed ? <PanelLeftIcon size={18} /> : <MenuIcon size={18} />}
            </button>

            <div className="model-selector-pill">
              <span className="model-status-indicator online" />
              <span className="model-name">
                {status?.configured_model ? `Qwen 2.5 3B` : "Odin Local AI"}
              </span>
              <span className="model-tag">Fast</span>
            </div>

            <div className="capabilities-pill">
              <span className="cap-item">
                <GlobeIcon size={12} className="inline-icon" />
                <span>Web Search</span>
              </span>
              <span className="cap-divider">•</span>
              <span className="cap-item">
                <BookOpenIcon size={12} className="inline-icon" />
                <span>Open Library</span>
              </span>
            </div>
          </div>

          <div className="navbar-right">
            <button
              className="icon-btn header-action-btn"
              onClick={newChat}
              title="Start a new chat (⌘K)"
              type="button"
            >
              <PlusIcon size={16} />
            </button>
          </div>
        </header>

        {/* Chat Feed */}
        <div className="chat-feed" role="region" aria-label="Messages">
          {/* Welcome Screen */}
          {isNewChat ? (
            <div className="welcome-hero-container">
              <div className="welcome-hero-badge">
                <BookOpenIcon size={38} className="welcome-hero-icon text-emerald" />
              </div>
              <h1 className="welcome-hero-title">What would you like to explore?</h1>
              <p className="welcome-hero-desc">
                Your intelligent companion for book research, latest releases, genre recommendations, and live literary insights.
              </p>

              <div className="suggestions-grid">
                {SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    className="suggestion-card"
                    onClick={() => void send(item.prompt)}
                    type="button"
                  >
                    <div className="suggestion-card-header">
                      <span className="suggestion-icon-wrap">{item.icon}</span>
                      <strong className="suggestion-title">{item.title}</strong>
                    </div>
                    <p className="suggestion-subtitle">{item.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-thread">
              {active.messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`message-row ${isUser ? "user-row" : "assistant-row"} ${
                      message.error ? "has-error" : ""
                    }`}
                  >
                    <div className="message-avatar-wrap">
                      {isUser ? (
                        <div className="user-avatar" title="You">
                          <UserIcon size={15} />
                        </div>
                      ) : (
                        <div className="assistant-avatar" title="Odin AI">
                          <BookOpenIcon size={15} />
                        </div>
                      )}
                    </div>

                    <div className="message-content-wrap">
                      <div className="message-bubble">
                        {/* Thinking Block */}
                        {!isUser &&
                          message.thinking &&
                          message.thinking.trim().length > 0 && (
                            <details
                              className="claude-thinking-block"
                              open={showThinking[message.id]}
                              onToggle={() => toggleThinking(message.id)}
                            >
                              <summary className="claude-thinking-summary">
                                <div className="thinking-summary-left">
                                  <BrainIcon size={14} className="text-emerald" />
                                  <span>Reasoning process</span>
                                </div>
                                <span className="thinking-chevron">▾</span>
                              </summary>
                              <pre className="thinking-content">{message.thinking}</pre>
                            </details>
                          )}

                        {/* Text Content */}
                        <SafeMarkdown
                          content={message.content || (streaming ? "▍" : "...")}
                          citations={message.citations}
                          messageId={message.id}
                        />

                        {/* Citation Reference Cards */}
                        {!isUser && (
                          <CitationCards
                            citations={message.citations ?? []}
                            content={message.content}
                            messageId={message.id}
                          />
                        )}
                      </div>

                      {/* Message Actions Bar */}
                      {!isUser && message.content && (
                        <div className="message-toolbar">
                          <button
                            className="msg-action-btn"
                            onClick={() => void copyText(message.content, message.id)}
                            title="Copy response"
                            type="button"
                          >
                            {copiedId === message.id ? (
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

                          {!streaming && (
                            <button
                              className="msg-action-btn"
                              onClick={() => {
                                const priorUser = active.messages
                                  .slice(0, active.messages.indexOf(message))
                                  .filter((e) => e.role === "user")
                                  .at(-1)?.content;
                                if (priorUser) void send(priorUser);
                              }}
                              title="Regenerate answer"
                              type="button"
                            >
                              <RotateCcwIcon size={13} />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={scrollAnchor} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="composer-container">
          {notice && (
            <div className="composer-notice-banner" role="alert">
              <span className="notice-icon">⚠️</span>
              <span className="notice-text">{notice}</span>
              <button
                className="notice-dismiss-btn"
                onClick={() => setNotice(null)}
                type="button"
              >
                <XIcon size={12} />
              </button>
            </div>
          )}

          <div className="composer-box">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about books, authors, 2025/2026 releases, reading lists..."
              rows={1}
              aria-label="Message Odin"
              disabled={streaming}
            />

            <div className="composer-toolbar">
              <div className="composer-toggles">
                <button
                  type="button"
                  className={`composer-pill-btn ${webSearchEnabled ? "active" : ""}`}
                  onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                  title="Search the live web for recent book news & releases"
                >
                  <GlobeIcon size={13} />
                  <span>Web Search</span>
                </button>

                <button
                  type="button"
                  className={`composer-pill-btn ${thinkingEnabled ? "active" : ""}`}
                  onClick={() => setThinkingEnabled(!thinkingEnabled)}
                  title="Toggle model reasoning visibility"
                >
                  <BrainIcon size={13} />
                  <span>Thinking</span>
                </button>
              </div>

              <div className="composer-submit-wrap">
                {streaming ? (
                  <button
                    className="composer-stop-btn"
                    onClick={stop}
                    title="Stop generating"
                    type="button"
                  >
                    <span className="stop-square" />
                  </button>
                ) : (
                  <button
                    className="composer-send-btn"
                    disabled={!input.trim() || !status?.available}
                    onClick={() => void send()}
                    title="Send message (Enter)"
                    type="button"
                  >
                    <ArrowUpIcon size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="composer-footer-hint">
            <span>Odin grounds answers in verified web & Open Library records. Click links to view source materials.</span>
          </div>
        </div>
      </main>
    </div>
  );
}