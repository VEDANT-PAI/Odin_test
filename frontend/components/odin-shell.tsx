"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Search, Sparkles, X } from "lucide-react";
import { BookCard } from "@/components/book-card";
import { RecommendationChat } from "@/components/recommendation-chat";
import { demoBooks } from "@/lib/demo-data";
import { getBooks, getPopular, type Book } from "@/lib/api";

function Brand() { return <Link href="/" className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-cyan-300 text-slate-950 shadow-[0_0_24px_rgba(103,232,249,.24)]"><BookOpen className="size-4" /></span><span className="text-sm font-bold tracking-[0.22em] text-white">ODIN</span></Link>; }

export function OdinShell() {
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<Book[]>(demoBooks);
  const [popular, setPopular] = useState<Book[]>(demoBooks);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Book[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionRequest = useRef(0);

  useEffect(() => { getPopular().then((items) => { setPopular(items); setApiReady(true); }).catch(() => undefined); }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return;
    }

    const requestId = ++suggestionRequest.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await getBooks(trimmedQuery, 6);
        if (requestId === suggestionRequest.current) {
          setSuggestions(result.items);
          setApiReady(true);
        }
      } catch {
        if (requestId === suggestionRequest.current) {
          const normalizedQuery = trimmedQuery.toLowerCase();
          setSuggestions(demoBooks.filter((book) => `${book.title} ${book.authors}`.toLowerCase().includes(normalizedQuery)).slice(0, 6));
        }
      } finally {
        if (requestId === suggestionRequest.current) setSuggestionLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [query]);

  function chooseSuggestion(book: Book) {
    setQuery(book.title);
    setSuggestions([]);
    setActiveSuggestion(-1);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) { setBooks(popular.length ? popular : demoBooks); setSearched(false); setSuggestions([]); return; }
    setSuggestions([]);
    setActiveSuggestion(-1);
    setLoading(true); setSearched(true);
    try { const result = await getBooks(query); setBooks(result.items); setApiReady(true); } catch { setBooks(demoBooks.filter((book) => `${book.title} ${book.authors}`.toLowerCase().includes(query.toLowerCase()))); } finally { setLoading(false); }
  }

  const displayed = searched ? books : popular;
  return <main className="odin-noise min-h-screen overflow-hidden">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 lg:px-8"><Brand /><div className="hidden items-center gap-8 text-xs text-white/45 md:flex"><a href="#discover" className="transition hover:text-white">Discover</a><a href="#chat" className="transition hover:text-white">Reading companion</a><a href="#how-it-works" className="transition hover:text-white">How it works</a><span className="flex items-center gap-2"><span className={`size-1.5 rounded-full ${apiReady ? "bg-emerald-400" : "bg-white/20"}`} />{apiReady ? "Catalog connected" : "Demo catalog"}</span></div><button className="rounded-full border border-white/10 px-4 py-2 text-xs text-white/70 transition hover:border-cyan-300/50 hover:text-white">Guest mode</button></nav>
    <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-14 lg:px-8 lg:pt-24"><div className="pointer-events-none absolute -left-32 top-0 size-96 rounded-full bg-cyan-400/10 blur-[120px]" /><div className="relative max-w-3xl"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[.06] px-3 py-1.5 text-[11px] font-medium text-cyan-200"><Sparkles className="size-3.5" /> A quieter way to find your next book</div><h1 className="max-w-3xl font-serif text-5xl leading-[.98] tracking-[-.04em] text-white sm:text-7xl">Find the books<br /><em className="text-cyan-200">you were looking for.</em></h1><p className="mt-7 max-w-xl text-base leading-7 text-white/50 sm:text-lg">Odin maps the stories, ideas, and obsessions behind great books — then brings the next one closer.</p><div className="relative"><form onSubmit={search} className="mt-10 flex max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-white/[.06] p-2 shadow-2xl shadow-black/30 backdrop-blur-xl"><Search className="ml-3 size-5 shrink-0 text-white/35" /><input aria-label="Search books" aria-autocomplete="list" aria-controls="odin-search-suggestions" aria-activedescendant={activeSuggestion >= 0 ? `odin-suggestion-${suggestions[activeSuggestion]?.id}` : undefined} value={query} onKeyDown={handleSearchKeyDown} onChange={(event) => { const nextQuery = event.target.value; setQuery(nextQuery); setSuggestionLoading(Boolean(nextQuery.trim())); if (!nextQuery.trim()) { setSuggestions([]); setSuggestionLoading(false); setActiveSuggestion(-1); } }} placeholder="Search by title, author, or feeling..." className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-white outline-none placeholder:text-white/30" />{query && <button type="button" onClick={() => { setQuery(""); setSearched(false); setBooks(popular); setSuggestions([]); setSuggestionLoading(false); }} aria-label="Clear search"><X className="size-4 text-white/35" /></button>}<button className="rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Explore</button></form>{query.trim() && (suggestionLoading || suggestions.length > 0) && <div id="odin-search-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#102027]/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">{suggestionLoading && !suggestions.length ? <div className="px-4 py-3 text-xs text-white/40">Searching the catalog...</div> : suggestions.map((book, index) => <button key={book.id} id={`odin-suggestion-${book.id}`} type="button" role="option" aria-selected={index === activeSuggestion} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSuggestion(book)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${index === activeSuggestion ? "bg-cyan-300/10" : "hover:bg-white/[.06]"}`}><div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-white/[.06] text-[10px] text-white/60">{book.image_url ? <Image src={book.image_url} alt="" width={36} height={36} unoptimized className="h-full w-full object-cover" /> : book.title.slice(0, 1)}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm text-white">{book.title}</span><span className="mt-0.5 block truncate text-xs text-white/40">{book.authors}</span></span><span className="text-[10px] text-white/25">{book.average_rating.toFixed(2)} ★</span></button>)}</div>}</div><div className="mt-5 flex flex-wrap gap-2 text-xs text-white/35"><span>Try</span>{["fantasy", "quiet stories", "Neil Gaiman"].map((term) => <button key={term} onClick={() => setQuery(term)} className="rounded-full border border-white/10 px-3 py-1.5 transition hover:border-white/25 hover:text-white/70">{term}</button>)}</div></div></section>
    <section id="discover" className="mx-auto max-w-7xl px-5 pb-24 lg:px-8"><div className="mb-8 flex items-end justify-between"><div><p className="eyebrow">{searched ? "Search results" : "A place to begin"}</p><h2 className="mt-2 font-serif text-3xl tracking-[-.025em] text-white">{searched ? `Books matching “${query}”` : "Popular among curious readers"}</h2></div>{!searched && <span className="text-xs text-white/35">Updated from the Odin catalog</span>}</div>{loading ? <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)}</div> : displayed.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">{displayed.map((book) => <BookCard key={book.id} book={book} />)}</div> : <div className="rounded-2xl border border-white/10 bg-white/[.03] px-6 py-16 text-center text-sm text-white/45">No books found. Try a different title or author.</div>}</section>
    <RecommendationChat books={popular.length ? popular : demoBooks} />
    <section id="how-it-works" className="border-t border-white/[.07] bg-white/[.02]"><div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-[1fr_2fr] lg:px-8"><div><p className="eyebrow">The Odin approach</p><h2 className="mt-3 max-w-sm font-serif text-4xl leading-tight tracking-[-.03em] text-white">Less noise.<br />More resonance.</h2></div><div className="grid gap-8 sm:grid-cols-3"><div><span className="step-number">01</span><h3 className="mt-5 text-sm font-semibold text-white">Start with a spark</h3><p className="mt-2 text-sm leading-6 text-white/40">Search a title, author, or the kind of world you want to disappear into.</p></div><div><span className="step-number">02</span><h3 className="mt-5 text-sm font-semibold text-white">Follow the thread</h3><p className="mt-2 text-sm leading-6 text-white/40">Explore books connected by themes, tags, and the readers who loved them.</p></div><div><span className="step-number">03</span><h3 className="mt-5 text-sm font-semibold text-white">Keep reading</h3><p className="mt-2 text-sm leading-6 text-white/40">Build a personal constellation of books worth returning to.</p></div></div></div></section>
    <footer className="mx-auto flex max-w-7xl items-center justify-between px-5 py-8 text-xs text-white/25 lg:px-8"><Brand /><span>Early access · Built for readers</span></footer>
  </main>;
}
