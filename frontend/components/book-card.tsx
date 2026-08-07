import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Star } from "lucide-react";
import type { Book } from "@/lib/api";

export function BookCover({ book, large = false }: { book: Book; large?: boolean }) {
  return book.image_url ? (
    <Image src={book.image_url} alt={`Cover of ${book.title}`} width={320} height={480} unoptimized className={`h-full w-full object-cover ${large ? "rounded-2xl" : "rounded-xl"}`} />
  ) : (
    <div className="book-cover-fallback h-full w-full p-4"><span className="font-serif text-lg leading-tight text-white/85">{book.title}</span><span className="mt-auto text-xs text-white/50">{book.authors}</span></div>
  );
}

export function BookCard({ book, compact = false }: { book: Book; compact?: boolean }) {
  return (
    <Link href={`/books/${book.id}`} className="book-card group">
      <div className={compact ? "aspect-[3/4]" : "aspect-[2/3]"}><BookCover book={book} /></div>
      <div className="mt-4 flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="truncate text-sm font-semibold text-white">{book.title}</h3><p className="mt-1 truncate text-xs text-white/45">{book.authors}</p></div>
        <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-white/25 transition group-hover:text-cyan-300" />
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-white/50"><Star className="size-3 fill-amber-300 text-amber-300" />{book.average_rating.toFixed(2)}<span className="text-white/20">·</span>{Intl.NumberFormat("en", { notation: "compact" }).format(book.ratings_count)} ratings</div>
    </Link>
  );
}
