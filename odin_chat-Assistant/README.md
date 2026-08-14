# Odin Chat Assistant

An isolated, local-first book research chat application with RAG (Retrieval-Augmented Generation). It does not depend on or alter the main Odin application.

## Quick Start

```bash
# 1. Pull models (chat + embeddings for RAG)
ollama pull qwen2.5:3b           # see "Model Name" below
ollama pull nomic-embed-text     # required for RAG embeddings
ollama serve

# 2. Configure
cp .env.example .env
# Edit .env if needed (see Configuration below)

# 3. Run both services via Docker (recommended)
docker compose up --build        # API on :8010, Frontend on :3001

# OR run separately (see run.md for details)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8010

cd frontend && npm install && npm run dev
```

Open <http://localhost:3001>. The API runs at <http://localhost:8010>.

---

## Features

- **Two-tier research**: Queries Open Library (authoritative book metadata) + local RAG store (your documents)
- **Streaming responses**: SSE tokens with citations emitted first
- **Citation-first design**: Model cites `[1]`, `[2]` only from retrieved records
- **Local persistence**: ChromaDB vector store persists to `./data/rag`
- **No database/auth/file storage**: Chat history in browser `localStorage`
- **Open Library only**: External book data source; covers via cover URLs
- **Bearer token auth**: Secure LLM access via tunnels

---

## Architecture

```
browser (Next.js, "use client" only)
  │
  │  fetch + ReadableStream SSE
  │  base URL = NEXT_PUBLIC_ODIN_CHAT_API_URL (build-time)
  ▼
FastAPI (backend/app/main.py)
  ├── app/retrieval.py  → httpx → https://openlibrary.org/search.json
  │       └─ in-memory TTL cache, 200ms rate gap
  └── app/ollama.py     → httpx → ${ODIN_CHAT_LLM_URL}/api/chat (streaming)
          │
          ▼
      Ollama (separate process)
          │
          ├── Chat model: qwen2.5:3b
          └── Embedding model: nomic-embed-text (for RAG)
              │
              ▼
          ChromaDB (backend/app/rag.py)
              └─ ./data/rag (persistent vector store)
```

---

## API Endpoints

### Core
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (Ollama + retrieval status) |
| `GET` | `/models/status` | Ollama model availability |
| `POST` | `/books/search` | Search Open Library only |
| `POST` | `/chat/stream` | Main chat: SSE (`citations` → `token`... → `done`) |

### RAG Management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/rag/ingest` | Add text document to vector store |
| `POST` | `/rag/search` | Semantic search RAG store |
| `GET` | `/rag/stats` | Document count & collection info |
| `DELETE` | `/rag/source/{source}` | Delete all chunks from a source |
| `POST` | `/rag/clear` | Clear entire RAG store |

### SSE Event Format (`/chat/stream`)
```text
event: citations
data: {"items": [{"key": "...", "title": "...", "authors": [...], ...}]}

event: token
data: {"text": "..."}

event: done
data: {"citations": 5}

event: notice
data: {"message": "Book research unavailable; continuing without citations."}

event: error
data: {"message": "The local model could not complete this response."}
```

---

## Configuration

All backend config via `backend/app/config.py` (pydantic-settings, prefix `ODIN_CHAT_`):

| Setting | Env Var | Default | Notes |
|---------|---------|---------|-------|
| `llm_url` | `ODIN_CHAT_LLM_URL` | `http://localhost:11434` | Ollama URL; use `http://host.docker.internal:11434` in Docker |
| `llm_model` | `ODIN_CHAT_LLM_MODEL` | `qwen2.5:3b` | **Must match pulled model** |
| `llm_timeout` | `ODIN_CHAT_LLM_TIMEOUT` | `90.0` | Slow inference needs ≥120s |
| `llm_bearer_token` | `ODIN_CHAT_LLM_BEARER_TOKEN` | `""` | When set, sends `Authorization: Bearer <token>` |
| `cors_origins` | `ODIN_CHAT_CORS_ORIGINS` | `http://localhost:3001` | Comma-separated; **requires restart to change** |
| `openlibrary_url` | `ODIN_CHAT_OPENLIBRARY_URL` | `https://openlibrary.org` | |
| `retrieval_cache_seconds` | `ODIN_CHAT_RETRIEVAL_CACHE_SECONDS` | `600` | Open Library cache TTL |
| `max_history_messages` | `ODIN_CHAT_MAX_HISTORY_MESSAGES` | `12` | History cap (frontend mirrors this) |
| `max_sources` | `ODIN_CHAT_MAX_SOURCES` | `5` | Open Library results limit |
| `max_output_tokens` | `ODIN_CHAT_MAX_OUTPUT_TOKENS` | `500` | LLM output cap |

### RAG Settings
| Setting | Env Var | Default | Notes |
|---------|---------|---------|-------|
| `rag_enabled` | `ODIN_CHAT_RAG_ENABLED` | `true` | Toggle RAG on/off |
| `rag_persist_dir` | `ODIN_CHAT_RAG_PERSIST_DIR` | `./data/rag` | ChromaDB persistence path |
| `rag_embedding_model` | `ODIN_CHAT_RAG_EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model |
| `rag_chunk_size` | `ODIN_CHAT_RAG_CHUNK_SIZE` | `500` | Words per chunk |
| `rag_chunk_overlap` | `ODIN_CHAT_RAG_CHUNK_OVERLAP` | `50` | Word overlap between chunks |
| `rag_top_k` | `ODIN_CHAT_RAG_TOP_K` | `5` | Chunks returned per query |

### Frontend (build-time)
| Env Var | Default | Notes |
|---------|---------|-------|
| `NEXT_PUBLIC_ODIN_CHAT_API_URL` | `http://localhost:8010` | **Inlined at build**; change requires rebuild |

---

## RAG Usage

### Ingest Documents
```bash
curl -X POST http://localhost:8010/rag/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your long document text here...",
    "source": "my_notes.txt",
    "metadata": {"category": "research", "author": "me"}
  }'
# Response: {"chunks_added": 3, "source": "my_notes.txt"}
```

### Search RAG Store
```bash
curl -X POST http://localhost:8010/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "machine learning", "top_k": 5}'
```

### Check Stats
```bash
curl http://localhost:8010/rag/stats
# {"enabled": true, "document_count": 42, "collection_name": "odin_rag"}
```

### Delete / Clear
```bash
# Delete one source
curl -X DELETE http://localhost:8010/rag/source/my_notes.txt

# Clear everything
curl -X POST http://localhost:8010/rag/clear
```

### How It Works
1. **Ingest**: Text → chunks (500 words, 50 overlap) → embeddings via `nomic-embed-text` → ChromaDB
2. **Query**: User message → embedding → cosine similarity search → top-K chunks
3. **Combine**: `/chat/stream` merges Open Library results + RAG results (OL first)
4. **Cite**: Model receives both citation sets, cites using `[1]`, `[2]` numbering

---

## Model Name Gotcha ⚠️

The default in code is `qwen2.5:3b` but you may have `qwen3:0.6b` pulled.

**If `/models/status` shows `available: false` or `/chat/stream` returns 503:**

```bash
# Option 1: Pull the default model
ollama pull qwen2.5:3b

# Option 2: Use your existing model (edit .env)
ODIN_CHAT_LLM_MODEL=qwen3:0.6b
```

Also ensure `nomic-embed-text` is pulled for RAG:
```bash
ollama pull nomic-embed-text
```

---

## Running with Docker

```bash
# Build and start (rebuilds on changes)
docker compose up --build

# Detached
docker compose up -d --build

# Logs
docker compose logs -f api
docker compose logs -f frontend

# Stop
docker compose down
```

**Docker networking**: The compose file uses `extra_hosts: host.docker.internal:host-gateway` so the API container reaches Ollama on your host at `http://host.docker.internal:11434`.

---

## Testing

```bash
cd backend
source .venv/bin/activate
pytest                    # All tests
pytest -q                 # Quiet
pytest tests/test_rag.py -v  # RAG tests only
pytest tests/test_retrieval.py -v  # Retrieval tests only
```

---

## Deployment (Free Tier)

See [DEPLOYMENT.md](DEPLOYMENT.md) for full guide:
- **Frontend**: Vercel (Hobby, free)
- **Backend**: Render (Free Web Service)
- **LLM**: Your laptop + Cloudflare Tunnel
- **Auth**: Bearer token shared between tunnel and Render
- **Cost**: $0/month

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `available: false` on `/models/status` | Wrong model name in `.env`; pull correct model |
| `retrieval_available: false` on `/health` | Open Library unreachable; check network |
| CORS error in browser | Set `ODIN_CHAT_CORS_ORIGINS` to frontend URL; restart backend |
| Chat hangs then fails | Increase `ODIN_CHAT_LLM_TIMEOUT` (slow laptop inference) |
| RAG returns no results | Ensure `nomic-embed-text` pulled; check `/rag/stats` |
| Permission denied on `/data/rag` | Config uses `./data/rag` (relative); ensure writable |
| Tunnel URL changed | Quick tunnels rotate; use named tunnel for stability |

---

## Project Structure

```
odin_chat-Assistant/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, lifespan, endpoints
│   │   ├── config.py        # Pydantic settings
│   │   ├── schemas.py       # Pydantic models
│   │   ├── ollama.py        # Ollama client (chat + embeddings)
│   │   ├── retrieval.py     # Open Library + combined search
│   │   └── rag.py           # ChromaDB RAG store
│   ├── tests/
│   │   ├── test_rag.py
│   │   └── test_retrieval.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Server component (renders ChatWorkspace)
│   │   └── layout.tsx
│   ├── components/
│   │   └── chat-workspace.tsx  # ONLY "use client" file
│   ├── lib/
│   │   └── api.ts           # SSE parser
│   ├── next.config.ts
│   └── package.json
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── DEPLOYMENT.md
├── run.md
└── README.md
```

---

## Key Implementation Details

- **Single client component**: `frontend/components/chat-workspace.tsx` holds all state
- **No SSR data fetching**: Frontend is static-exportable (`output: 'export'`)
- **Stateless backend**: In-process Open Library cache lost on restart (acceptable)
- **Citations are ground truth**: Backend only surfaces records it retrieved; never trusts model-claimed citations
- **Rate limiting**: 200ms gap between Open Library calls
- **Client abort handling**: `is_disconnected()` check stops Ollama generation on disconnect
- **History cap**: 12 messages (both frontend and backend)

---

## License

MIT — isolated from main Odin application.