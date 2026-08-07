"use client";

import { useState } from "react";
import { LoaderCircle, MessageCircleHeart, Send, Star } from "lucide-react";
import { BookCard } from "@/components/book-card";
import { getGenreRecommendations, getRatingsRecommendations, type Book } from "@/lib/api";

const genres = ["Fantasy", "Romance", "Mystery", "Science fiction", "Historical", "Young adult"];

type Mode = "genres" | "ratings";

export function RecommendationChat({ books }: { books: Book[] }) {
  const [mode, setMode] = useState<Mode>("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>(["Fantasy"]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [recommendations, setRecommendations] = useState<Book[]>([]);
  const [message, setMessage] = useState("Choose a couple of genres and I’ll find five books where they meet.");
  const [loading, setLoading] = useState(false);

  function toggleGenre(genre: string) {
    setSelectedGenres((current) => current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre].slice(-3));
  }

  async function recommend() {
    const ratingEntries = Object.entries(ratings).map(([book_id, rating]) => ({ book_id: Number(book_id), rating }));
    if (mode === "genres" && !selectedGenres.length) {
      setMessage("Pick at least one genre first, then I can start exploring.");
      return;
    }
    if (mode === "ratings" && !ratingEntries.length) {
      setMessage("Rate at least one book below. The more you rate, the sharper my picks become.");
      return;
    }
    setLoading(true);
    setMessage(mode === "genres" ? "Looking for the overlap in those worlds…" : "Following readers with a similar rating trail…");
    try {
      const picks = mode === "genres" ? await getGenreRecommendations(selectedGenres) : await getRatingsRecommendations(ratingEntries);
      setRecommendations(picks);
      setMessage(picks.length ? `Here are five picks ${mode === "genres" ? `for ${selectedGenres.join(" + ")}` : "shaped by your ratings"}.` : "I couldn’t find a strong match yet. Try another combination.");
    } catch {
      setMessage("I can’t reach the recommendation service right now. Please try again in a moment.");
    } finally { setLoading(false); }
  }

  return <section id="chat" className="border-y border-white/[.07] bg-[#0b181d]/70">
    <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
      <div className="mb-9 max-w-2xl">
        <p className="eyebrow">Odin’s reading companion</p>
        <h2 className="mt-3 font-serif text-4xl tracking-[-.03em] text-white">Hello, reader. Where should we wander?</h2>
        <p className="mt-3 text-sm leading-6 text-white/45">Tell Odin what you’re in the mood for, or teach it with the books you’ve already rated.</p>
      </div>
      <div className="rounded-3xl border border-cyan-300/15 bg-white/[.035] p-4 shadow-2xl shadow-black/20 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cyan-300 text-slate-950"><MessageCircleHeart className="size-5" /></span>
          <div className="rounded-2xl rounded-tl-sm bg-white/[.07] px-4 py-3 text-sm leading-6 text-white/75">{message}</div>
        </div>
        <div className="mt-6 flex gap-2 border-b border-white/10 pb-4">
          <button onClick={() => setMode("genres")} className={`rounded-full px-4 py-2 text-xs font-medium transition ${mode === "genres" ? "bg-cyan-300 text-slate-950" : "text-white/50 hover:text-white"}`}>Mix genres</button>
          <button onClick={() => setMode("ratings")} className={`rounded-full px-4 py-2 text-xs font-medium transition ${mode === "ratings" ? "bg-cyan-300 text-slate-950" : "text-white/50 hover:text-white"}`}>Use my ratings</button>
        </div>
        {mode === "genres" ? <div className="pt-5"><p className="text-xs text-white/45">Choose up to three genres</p><div className="mt-3 flex flex-wrap gap-2">{genres.map((genre) => <button key={genre} onClick={() => toggleGenre(genre)} className={`rounded-full border px-4 py-2 text-xs transition ${selectedGenres.includes(genre) ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-white/55 hover:border-white/30 hover:text-white"}`}>{genre}</button>)}</div></div> : <div className="pt-5"><p className="text-xs text-white/45">Rate a few books you know. Odin uses readers who rated those books similarly.</p><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{books.slice(0, 6).map((book) => <div key={book.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[.045] px-3 py-2.5"><span className="min-w-0 truncate text-xs text-white/70">{book.title}</span><span className="flex shrink-0">{[1, 2, 3, 4, 5].map((value) => <button key={value} aria-label={`Rate ${book.title} ${value} stars`} onClick={() => setRatings((current) => ({ ...current, [book.id]: value }))} className="p-0.5"><Star className={`size-3.5 ${value <= (ratings[book.id] ?? 0) ? "fill-cyan-300 text-cyan-300" : "text-white/20"}`} /></button>)}</span></div>)}</div></div>}
        <button disabled={loading} onClick={recommend} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Give me 5 recommendations</button>
      </div>
      {recommendations.length > 0 && <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">{recommendations.map((book) => <BookCard key={book.id} book={book} />)}</div>}
    </div>
  </section>;
}
