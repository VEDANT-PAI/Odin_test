# Odin Startup Instructions

Odin is composed of a Next.js frontend, a FastAPI backend, and a PostgreSQL database.

## Requirements

- Docker Engine with Docker Compose support
- Or, for manual setup:
  - Python 3.12+
  - Node.js 20+
  - PostgreSQL 16+

## Recommended: start everything with Docker

From the repository root — the directory containing `docker-compose.yml` — run:

```bash
docker compose up --build
```

This will:

1. Start PostgreSQL.
2. Wait until PostgreSQL is healthy.
3. Apply Alembic migrations.
4. Import the processed Goodreads catalog and tags.
5. Start the FastAPI backend.
6. Start the Next.js frontend.

Open:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Backend health check: http://localhost:8000/api/v1/health

To run in the background:

```bash
docker compose up --build -d
```

To view logs:

```bash
docker compose logs -f
```

To stop the application while preserving PostgreSQL data:

```bash
docker compose down
```

To remove the database volume and start with a completely empty database:

```bash
docker compose down -v
```

The first command may take several minutes because it builds both application images and imports the catalog. Later starts reuse the images and database volume.

## Manual backend startup

Run these commands from the repository root:

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

The backend will be available at http://localhost:8000.

The importer reads from `datasets/dataset_processed/` and does not modify the original raw datasets.

### Backend environment variables

`backend/.env` supports:

```env
ODIN_DATABASE_URL=postgresql+psycopg://odin:odin@localhost:5432/odin
ODIN_CORS_ORIGINS=http://localhost:3000
ODIN_DATA_DIR=../datasets/dataset_processed
```

If you are already inside `backend/`, do not run `cd backend` again:

```bash
source ../.venv/bin/activate
docker compose up -d --wait postgres
alembic upgrade head
python -m odin.cli --include-tags
uvicorn odin.main:app --reload --port 8000
```

## Manual frontend startup

Open a second terminal and run these commands from the repository root:

```bash
cd frontend
npm ci
printf 'NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1\n' > .env.local
npm run dev
```

Open http://localhost:3000.

The frontend uses the backend API when it is available and falls back to demo catalog data when the backend is offline.

### Frontend production check

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run build
npm run start
```

## Verify the complete manual setup

Check the backend:

```bash
curl http://localhost:8000/api/v1/health
```

Expected response:

```json
{"status":"ok","service":"odin-api"}
```

Check the catalog:

```bash
curl 'http://localhost:8000/api/v1/books?q=harry&limit=2'
curl 'http://localhost:8000/api/v1/recommendations/popular?limit=2'
```

## Common issues

### `cd: backend: No such file or directory`

You are already inside the `backend/` directory. Continue with the backend commands without running `cd backend` again.

### PostgreSQL connection errors during first startup

Wait for the database health check before running migrations:

```bash
docker compose up -d --wait postgres
```

### Port already in use

Odin uses these ports:

- `3000` for the frontend
- `8000` for the API
- `5432` for PostgreSQL

Stop the conflicting service or change the port mapping in `docker-compose.yml`.

### Re-import the catalog

From `backend/`:

```bash
python -m odin.cli --include-tags
```

The import is safe to rerun and preserves the original dataset files.

