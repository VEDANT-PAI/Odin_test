export type Tag = { id: number; name: string };

export type Book = {
  id: number;
  title: string;
  authors: string;
  average_rating: number;
  ratings_count: number;
  image_url?: string | null;
  small_image_url?: string | null;
  publication_year?: number | null;
  original_title?: string | null;
  language_code?: string | null;
  isbn?: string | null;
  tags?: Tag[];
};

export type BookPage = { items: Book[]; page: number; limit: number; total: number };

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatRecommendation = Book;
export type ChatResponse = {
  message: string;
  recommendations: ChatRecommendation[];
  intent: string;
  strategy: string;
  llm_used: boolean;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function getBooks(query = "", limit = 12): Promise<BookPage> {
  const params = new URLSearchParams({ limit: String(limit), page: "1" });
  if (query.trim()) params.set("q", query.trim());
  const response = await fetch(`${API_URL}/books?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error("The catalog is currently unavailable.");
  return response.json();
}

export async function getPopular(limit = 12): Promise<Book[]> {
  const response = await fetch(`${API_URL}/recommendations/popular?limit=${limit}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Recommendations are currently unavailable.");
  const data: { items: Book[] } = await response.json();
  return data.items;
}

export async function getBook(id: string): Promise<Book> {
  const response = await fetch(`${API_URL}/books/${id}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Book not found");
  return response.json();
}

export async function getSimilar(id: string): Promise<Book[]> {
  const response = await fetch(`${API_URL}/recommendations/similar/${id}?limit=6`, { cache: "no-store" });
  if (!response.ok) throw new Error("Similar books are currently unavailable.");
  const data: { items: Book[] } = await response.json();
  return data.items;
}

async function recommendationRequest(path: string, body: object): Promise<Book[]> {
  const response = await fetch(`${API_URL}/recommendations/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Recommendations are currently unavailable.");
  const data: { items: Book[] } = await response.json();
  return data.items;
}

export function getGenreRecommendations(genres: string[]): Promise<Book[]> {
  return recommendationRequest("genres", { genres, limit: 5 });
}

export function getRatingsRecommendations(ratings: { book_id: number; rating: number }[]): Promise<Book[]> {
  return recommendationRequest("ratings", { ratings, limit: 5 });
}

export async function chat(message: string, history: ChatMessage[]): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: history.slice(-8) }),
  });
  if (!response.ok) throw new Error("The reading companion is currently unavailable.");
  return response.json();
}
