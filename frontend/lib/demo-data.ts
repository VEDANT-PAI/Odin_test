import type { Book } from "./api";

export const demoBooks: Book[] = [
  { id: 1, title: "The Name of the Wind", authors: "Patrick Rothfuss", average_rating: 4.55, ratings_count: 1600000, image_url: "https://images.gr-assets.com/books/1481052340l/186074.jpg", publication_year: 2007, tags: [{ id: 1, name: "fantasy" }, { id: 2, name: "adventure" }] },
  { id: 2, title: "The Ocean at the End of the Lane", authors: "Neil Gaiman", average_rating: 4.00, ratings_count: 560000, image_url: "https://images.gr-assets.com/books/1497098563l/15783514.jpg", publication_year: 2013, tags: [{ id: 3, name: "fiction" }, { id: 4, name: "magical-realism" }] },
  { id: 3, title: "The Shadow of the Wind", authors: "Carlos Ruiz Zafón", average_rating: 4.28, ratings_count: 850000, image_url: "https://images.gr-assets.com/books/1483103331l/1232.jpg", publication_year: 2001, tags: [{ id: 5, name: "mystery" }, { id: 3, name: "fiction" }] },
  { id: 4, title: "A Wizard of Earthsea", authors: "Ursula K. Le Guin", average_rating: 4.27, ratings_count: 330000, image_url: "https://images.gr-assets.com/books/1353428380l/13642.jpg", publication_year: 1968, tags: [{ id: 1, name: "fantasy" }, { id: 6, name: "classic" }] },
  { id: 5, title: "Piranesi", authors: "Susanna Clarke", average_rating: 4.31, ratings_count: 320000, image_url: "https://images.gr-assets.com/books/1631251689l/50202953.jpg", publication_year: 2020, tags: [{ id: 4, name: "magical-realism" }, { id: 3, name: "fiction" }] },
  { id: 6, title: "Station Eleven", authors: "Emily St. John Mandel", average_rating: 4.07, ratings_count: 600000, image_url: "https://images.gr-assets.com/books/1451445741l/20170404.jpg", publication_year: 2014, tags: [{ id: 7, name: "dystopian" }, { id: 3, name: "fiction" }] },
];

