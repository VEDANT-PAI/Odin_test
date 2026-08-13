# Odin Chat Assistant

An isolated, local-first book chat application. It does not depend on or alter the main Odin application.

## Start

```bash
ollama pull qwen2.5:3b
ollama serve
cp .env.example .env
docker compose up --build
```

Open http://localhost:3001. The API runs at http://localhost:8010.

The frontend keeps chats in browser local storage. The backend retrieves a small, cached set of Open Library records for citations and links directly to Open Library cover URLs; it does not crawl or store cover images.

## API

- `GET /health`
- `GET /models/status`
- `POST /books/search`
- `POST /chat/stream` — server-sent events: `citations`, `token`, `done`, or `error`.
