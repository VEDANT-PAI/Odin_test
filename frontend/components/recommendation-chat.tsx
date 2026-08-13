"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MessageCircleHeart, Send, Star } from "lucide-react";
import { BookCard } from "@/components/book-card";
import {
  chat,
  getGenreRecommendations,
  getRatingsRecommendations,
  type Book,
  type ChatMessage,
} from "@/lib/api";

const genres = ["Fantasy", "Romance", "Mystery", "Science fiction", "Historical", "Young adult"];
type Mode = "genres" | "ratings";
type ConversationMessage = ChatMessage & { id: string; recommendations?: Book[] };

const welcome: ConversationMessage = {
  id: "welcome",
  role: "assistant",
  content: "Tell me what you’re in the mood to read. I’ll find books from Odin’s catalog and help you choose between them.",
};

export function RecommendationChat({ books }: { books: Book[] }) {
  const [mode, setMode] = useState<Mode>("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Fantasy"]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [messages, setMessages] = useState<ConversationMessage[]>([welcome]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newestMessage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    newestMessage.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function toggleGenre(genre: string) {
    setSelectedGenres((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre].slice(-3));
  }

  function appendAssistant(content: string, recommendations: Book[] = []) {
    setMessages((current) => [...current, {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content,
      recommendations,
    }]);
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || loading) return;

    const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: message }]);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const response = await chat(message, history);
      appendAssistant(response.message, response.recommendations);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function recommendFromControls() {
    const ratingEntries = Object.entries(ratings).map(([book_id, rating]) => ({ book_id: Number(book_id), rating }));
    if (mode === "genres" && !selectedGenres.length) {
      setError("Pick at least one genre first, then Odin can start exploring.");
      return;
    }
    if (mode === "ratings" && !ratingEntries.length) {
      setError("Rate at least one book below. The more you rate, the sharper Odin’s picks become.");
      return;
    }

    const requestLabel = mode === "genres"
      ? `Find books blending ${selectedGenres.join(" + ")}`
      : "Recommend books based on my ratings";
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", content: requestLabel }]);
    setError(null);
    setLoading(true);
    try {
      const picks = mode === "genres"
        ? await getGenreRecommendations(selectedGenres)
        : await getRatingsRecommendations(ratingEntries);
      appendAssistant(
        picks.length
          ? `Here are some catalog picks ${mode === "genres" ? `for ${selectedGenres.join(" + ")}` : "shaped by your ratings"}.`
          : "I couldn’t find a strong match yet. Try another combination.",
        picks,
      );
    } catch {
      setError("I can’t reach the recommendation service right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return <section id="chat" className="border-y border-white/[.07] bg-[#0b181d]/70">
    <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
      <div className="mb-9 max-w-2xl">
        <p className="eyebrow">Odin’s reading companion</p>
        <h2 className="mt-3 font-serif text-4xl tracking-[-.03em] text-white">Hello, reader. Where should we wander?</h2>
        <p className="mt-3 text-sm leading-6 text-white/45">Ask naturally, or fine-tune a recommendation with genres and ratings you already know.</p>
      </div>
      <div className="rounded-3xl border border-cyan-300/15 bg-white/[.035] p-4 shadow-2xl shadow-black/20 sm:p-6">
        <div aria-live="polite" className="max-h-[38rem] space-y-5 overflow-y-auto pr-1">
          {messages.map((message) => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] sm:max-w-[70%]" : "max-w-4xl"}>
            {message.role === "assistant" ? <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-300 text-slate-950"><MessageCircleHeart className="size-5" /></span><p className="rounded-2xl rounded-tl-sm bg-white/[.07] px-4 py-3 text-sm leading-6 text-white/75">{message.content}</p></div> : <p className="rounded-2xl rounded-tr-sm bg-cyan-300 px-4 py-3 text-sm leading-6 text-slate-950">{message.content}</p>}
            {message.role === "assistant" && message.recommendations?.length ? <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 pl-12 sm:grid-cols-3 lg:grid-cols-5">{message.recommendations.map((book) => <BookCard key={book.id} book={book} />)}</div> : null}
          </div>)}
          {loading ? <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-cyan-300 text-slate-950"><MessageCircleHeart className="size-5" /></span><div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white/[.07] px-4 py-3 text-sm text-white/60"><LoaderCircle className="size-4 animate-spin" /> Odin is looking through the shelves…</div></div> : null}
          <div ref={newestMessage} />
        </div>
        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">{error}</p> : null}
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="flex gap-2"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleInputKeyDown} maxLength={500} rows={2} aria-label="Message Odin" placeholder="Try: something dark like The Witcher..." className="min-h-12 flex-1 resize-none rounded-xl border border-white/10 bg-white/[.045] px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60" /><button type="button" disabled={loading || !input.trim()} onClick={() => void sendMessage()} className="inline-flex shrink-0 items-center gap-2 self-end rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-50"><Send className="size-4" /><span className="hidden sm:inline">Send</span></button></div>
          <p className="mt-2 text-xs text-white/35">Enter to send · Shift+Enter for a new line</p>
        </div>
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex gap-2"><button type="button" onClick={() => setMode("genres")} className={`rounded-full px-4 py-2 text-xs font-medium transition ${mode === "genres" ? "bg-cyan-300 text-slate-950" : "text-white/50 hover:text-white"}`}>Mix genres</button><button type="button" onClick={() => setMode("ratings")} className={`rounded-full px-4 py-2 text-xs font-medium transition ${mode === "ratings" ? "bg-cyan-300 text-slate-950" : "text-white/50 hover:text-white"}`}>Use my ratings</button></div>
          {mode === "genres" ? <div className="pt-5"><p className="text-xs text-white/45">Choose up to three genres</p><div className="mt-3 flex flex-wrap gap-2">{genres.map((genre) => <button key={genre} type="button" onClick={() => toggleGenre(genre)} className={`rounded-full border px-4 py-2 text-xs transition ${selectedGenres.includes(genre) ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/55 hover:border-white/30 hover:text-white"}`}>{genre}</button>)}</div></div> : <div className="pt-5"><p className="text-xs text-white/45">Rate a few books you know. Odin uses readers who rated those books similarly.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{books.slice(0, 6).map((book) => <div key={book.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[.045] px-3 py-2.5"><span className="min-w-0 truncate text-xs text-white/70">{book.title}</span><span className="flex shrink-0">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`Rate ${book.title} ${value} stars`} onClick={() => setRatings((current) => ({ ...current, [book.id]: value }))} className="p-0.5"><Star className={`size-3.5 ${value <= (ratings[book.id] ?? 0) ? "fill-cyan-300 text-cyan-300" : "text-white/20"}`} /></button>)}</span></div>)}</div></div>}
          <button type="button" disabled={loading} onClick={() => void recommendFromControls()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Give me 5 recommendations</button>
        </div>
      </div>
    </div>
  </section>;
}
