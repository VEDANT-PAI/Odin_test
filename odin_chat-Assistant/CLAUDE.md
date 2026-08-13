# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A two-tier book research chatbot, isolated from the main Odin application. FastAPI backend streams Ollama completions; Next.js frontend is a single client component that holds chat state in `localStorage`. Open Library is the only external book data source. No database, no auth, no file storage.

## Run it locally

```bash
# one-time
ollama pull qwen2.5:3b            # or qwen3:0.6b — see "Model name gotcha" below
cp .env.example .env

# both services via Docker (recommended)
docker compose up --build         # api on :8010, frontend on :3001

# OR run separately (see run.md)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8010

cd frontend && npm install && npm run dev
```

Open <http://localhost:3001>.

## Common commands

| Task | Command | Where |
|---|---|---|
| Backend tests | `pytest` (or `pytest -q`) | `backend/` (`.venv` already exists) |
| Single test | `pytest tests/test_retrieval.py::test_foo` | `backend/` |
| Backend import check | `python -c "import app.main"` | `backend/` |
| Frontend dev server | `npm run dev` | `frontend/` (port 3001) |
| Frontend build | `npm run build` | `frontend/` |
| Frontend lint | `npm run lint` | `frontend/` |
| Frontend typecheck | `npm run typecheck` | `frontend/` |
| Rebuild & run both | `docker compose up --build` | repo root |

There is no Makefile, no pre-commit hook, no CI. Tests are run manually.

## Architecture

```
browser (Next.js, "use client" only)
  │
  │  fetch + ReadableStream SSE
  │  base URL = NEXT_PUBLIC_ODIN_CHAT_API_URL (build-time, baked into bundle)
  ▼
FastAPI (app/main.py)
  ├── app/retrieval.py  → httpx → https://openlibrary.org/search.json  (in-memory TTL cache, 200ms rate gap)
  └── app/ollama.py     → httpx → ${ODIN_CHAT_LLM_URL}/api/chat        (streaming, no buffering)
                              │
                              ▼
                          Ollama  (separate process, typically user's laptop or a sidecar)
```

- **One interactive surface.** `frontend/components/chat-workspace.tsx` is the only `"use client"` file. Everything else in `frontend/app/` and `frontend/lib/` is server / data-only. The root layout and page are stateless server components.
- **No SSR data fetching.** `app/page.tsx` just renders `<ChatWorkspace />`. No `cookies()`, no `headers()`, no `force-dynamic`. The frontend is trivially static-exportable (`output: 'export'` in `next.config.ts`), though it currently runs as a normal Next.js server.
- **Backend is stateless across restarts** except for the in-process Open Library cache (`app/retrieval.py:17`). The cache and rate-limit state are lost on every redeploy — acceptable for a chat demo.
- **`/chat/stream` SSE contract** (`backend/app/main.py:65-84`) is the only integration point with the frontend. Events: `citations` → repeated `token` → `done`, or `error`/`notice`. The frontend's `lib/api.ts` parses this exact shape — changing event names is a breaking change to both ends.
- **Citations are factual ground truth, not decoration.** The system prompt in `app/ollama.py:12-19` instructs the model to cite `[1]`, `[2]`, etc. only from the Open Library records the backend supplied. The backend never trusts model-claimed citations — it only surfaces the records it retrieved.

## Configuration

All backend config goes through `app/config.py` (pydantic-settings, env prefix `ODIN_CHAT_`). Notable fields:

| Setting | Env var | Default | Notes |
|---|---|---|---|
| `llm_url` | `ODIN_CHAT_LLM_URL` | `http://localhost:11434` | Where Ollama listens. Set to `http://host.docker.internal:11434` from inside a container, or to a tunnel URL in production. |
| `llm_model` | `ODIN_CHAT_LLM_MODEL` | `qwen2.5:3b` | Must match a model the user has actually pulled. |
| `llm_bearer_token` | `ODIN_CHAT_LLM_BEARER_TOKEN` | `""` (empty) | When set, `OllamaClient` sends `Authorization: Bearer <token>` on every request. Pair with a tunnel that enforces the same token. |
| `llm_timeout` | `ODIN_CHAT_LLM_TIMEOUT` | `90.0` | Slow laptop inference needs ≥120s. |
| `cors_origins` | `ODIN_CHAT_CORS_ORIGINS` | `http://localhost:3001` | Comma-separated. Read once at startup — change requires restart. |

Frontend has exactly one: `NEXT_PUBLIC_ODIN_CHAT_API_URL`. **This is a build-time constant** — it gets inlined into the client bundle at `npm run build`. Changing it requires a rebuild, not a redeploy. Both `frontend/.env.example` and the repo-root `.env.example` document these.

## Things that bite

- **Model name gotcha.** The default in code is `qwen2.5:3b` but `run.md` notes the user actually has `qwen3:0.6b` pulled. If `/models/status` returns `available: false` and `/chat/stream` returns 503, this is almost always the cause. Fix by setting `ODIN_CHAT_LLM_MODEL=qwen3:0.6b` in `.env`.
- **CORS is locked at startup.** A new frontend origin requires a backend restart. There is no per-request origin check.
- **SSE buffering.** `main.py:84` sets `X-Accel-Buffering: no` on the streaming response. If you ever add a reverse proxy (nginx, Cloudflare) in front, double-check it doesn't buffer.
- **`is_disconnected()` check in `main.py:75`.** Honors client aborts mid-stream so Ollama doesn't keep generating for a user who left. Don't remove it.
- **Open Library rate limiting.** `retrieval.py:53-55` enforces a 200ms gap between calls. If Open Library is slow, the `/chat/stream` request will wait — and may hit `ODIN_CHAT_LLM_TIMEOUT` overall. The backend already handles the failure by emitting a `notice` event and continuing without citations (`main.py:67-71`).
- **Chat history is capped at 12 messages** (`max_history_messages`, `schemas.py:20`). The frontend also slices to 12 (`lib/api.ts:18`). If you change one, change the other.
- **`docker-compose.yml` does not include an Ollama service.** It uses `host.docker.internal` (via the `extra_hosts` mapping) to reach Ollama on the host machine. Don't add an `ollama` service to compose without also updating the URL the api uses.
- **No state on the server.** Restarting Render/the backend loses the Open Library cache. Acceptable; just be aware the first chat of a session may be slow.
