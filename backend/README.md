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
