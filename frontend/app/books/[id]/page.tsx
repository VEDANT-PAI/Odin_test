import Link from "next/link";
import { ArrowLeft, BookOpen, CalendarDays, Star } from "lucide-react";
import { BookCard, BookCover } from "@/components/book-card";
import { getBook, getSimilar, type Book } from "@/lib/api";
import { demoBooks } from "@/lib/demo-data";

function Brand() { return <Link href="/" className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-lg bg-cyan-300 text-slate-950"><BookOpen className="size-4" /></span><span className="text-sm font-bold tracking-[0.22em] text-white">ODIN</span></Link>; }

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let book: Book | undefined;
  let similar: Book[] = [];
  try { book = await getBook(id); similar = await getSimilar(id); } catch { book = demoBooks.find((item) => item.id === Number(id)); similar = demoBooks.filter((item) => item.id !== Number(id)).slice(0, 6); }
  if (!book) return <main className="min-h-screen bg-[#071014] px-5 py-8 text-white"><Brand /><div className="mx-auto max-w-3xl py-32 text-center"><h1 className="font-serif text-4xl">Book not found</h1><Link href="/" className="mt-6 inline-block text-sm text-cyan-200">Return to discovery</Link></div></main>;
  return <main className="odin-noise min-h-screen text-white"><nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 lg:px-8"><Brand /><Link href="/" className="flex items-center gap-2 text-xs text-white/45 transition hover:text-white"><ArrowLeft className="size-4" /> Back to discovery</Link></nav><section className="mx-auto max-w-5xl px-5 pb-20 pt-12 lg:px-8 lg:pt-20"><div className="grid gap-10 md:grid-cols-[220px_1fr] md:gap-14"><div className="aspect-[2/3] max-w-[220px]"><BookCover book={book} large /></div><div className="self-center"><p className="eyebrow">A book worth finding</p><h1 className="mt-4 max-w-2xl font-serif text-5xl leading-[.98] tracking-[-.04em] sm:text-6xl">{book.title}</h1><p className="mt-5 text-lg text-white/55">{book.authors}</p><div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-white/55"><span className="flex items-center gap-2"><Star className="size-4 fill-amber-300 text-amber-300" />{book.average_rating.toFixed(2)} rating</span><span className="text-white/15">/</span><span>{Intl.NumberFormat("en", { notation: "compact" }).format(book.ratings_count)} readers</span>{book.publication_year && <><span className="text-white/15">/</span><span className="flex items-center gap-2"><CalendarDays className="size-4" />{Math.round(book.publication_year)}</span></>}</div><div className="mt-9 flex flex-wrap gap-2">{(book.tags ?? []).slice(0, 8).map((tag) => <span key={tag.id} className="rounded-full border border-cyan-200/15 bg-cyan-200/[.06] px-3 py-1.5 text-xs text-cyan-100/70">{tag.name}</span>)}</div></div></div></section><section className="border-t border-white/[.07] bg-white/[.02]"><div className="mx-auto max-w-5xl px-5 py-16 lg:px-8"><p className="eyebrow">Keep exploring</p><h2 className="mt-3 font-serif text-3xl tracking-[-.025em]">If this found you, try these next</h2><div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-6">{similar.map((item) => <BookCard key={item.id} book={item} />)}</div></div></section></main>;
}

