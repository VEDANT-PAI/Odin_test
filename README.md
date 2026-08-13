# Odin

## Start the full project

After cloning the repository and installing Docker with Compose support, run this one command from the repository root:

```bash
docker compose up --build
```

This starts PostgreSQL, applies migrations, imports the processed Goodreads catalog, starts the FastAPI backend, and starts the Next.js frontend.

- Frontend: http://localhost:3000
- API: http://localhost:8000
- API health: http://localhost:8000/api/v1/health

## Optional local chat assistant

The reading companion can use a local Ollama explanation layer while keeping book
selection deterministic and fully functional without it. Install Ollama and pull the
small model manually:

```bash
ollama pull qwen3:0.6b
```

When running through Docker Compose, Odin connects to the host at
`http://host.docker.internal:11434` by default (including modern Linux Docker through
the supplied host-gateway mapping). Disable it at any time with:

```bash
ODIN_LLM_ENABLED=false docker compose up --build
```

The first startup builds the images and imports the catalog, so it can take a few minutes. Later starts reuse the built images and database volume.

To run in the background:

```bash
docker compose up --build -d
```

To stop the services while keeping database data:

```bash
docker compose down
```
