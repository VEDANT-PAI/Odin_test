# Odin API

CPU-first FastAPI service for the early Odin book discovery experience.

## Local setup

From the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
docker compose up -d --wait postgres
cd backend
alembic upgrade head
python -m odin.cli --include-tags
uvicorn odin.main:app --reload --port 8000
```

If you are already inside `backend/`, do not run `cd backend` again:

```bash
source ../.venv/bin/activate
docker compose up -d --wait postgres
alembic upgrade head
python -m odin.cli --include-tags
uvicorn odin.main:app --reload --port 8000
```

The importer reads only from `datasets/dataset_processed/`; original source files are never modified. The `--include-tags` step is optional and can be rerun safely.

Health: http://localhost:8000/api/v1/health

## Optional local chat assistant

Odin's chat endpoint always uses the catalog's deterministic recommendation logic.
Ollama only turns the selected books into a short conversational explanation, so the
API remains usable when it is disabled or offline.

Install Ollama, then download the small local model yourself:

```bash
ollama pull qwen3:0.6b
```

For an API running directly on your machine, the defaults work as-is. Configure it
with `ODIN_LLM_ENABLED`, `ODIN_LLM_URL`, `ODIN_LLM_MODEL`, and `ODIN_LLM_TIMEOUT`.
To turn off the optional model entirely, set `ODIN_LLM_ENABLED=false`.

For Docker Compose, the default API URL is `http://host.docker.internal:11434`; the
included `host-gateway` mapping supports modern Linux Docker too. If your Ollama
server is elsewhere, set `ODIN_LLM_URL` to its reachable URL before starting Compose.

Chat health: http://localhost:8000/api/v1/chat/health
