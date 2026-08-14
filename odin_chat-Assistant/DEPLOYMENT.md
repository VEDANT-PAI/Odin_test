# Free Deployment Plan: Odin Chat Assistant

## Overview

Deploy the Odin Chat Assistant to a public URL for free while keeping the LLM running on your local machine.

**Architecture:**
- **Frontend** → Vercel (Hobby tier, free)
- **Backend** → Render (Free Web Service)
- **LLM & Embeddings** → Ollama on your local machine
- **Local Machine → Internet** → Cloudflare Tunnel (Free tier)

All layers are free: Vercel Hobby, Render free web service, Cloudflare Tunnel free tier, Ollama on your local hardware, and public Open Library APIs.

---

## Prerequisites

- GitHub repository with your Odin Chat Assistant code pushed
- Free accounts: [Render](https://render.com), [Vercel](https://vercel.com), [Cloudflare](https://cloudflare.com)
- `ollama serve` running locally with your chosen model (e.g. `qwen2.5:3b`, `qwen3:0.6b`, `qwen3:4b`) and embedding model (`nomic-embed-text`)
- Optional: A domain registered or active on Cloudflare (needed for a persistent Named Tunnel; Quick Tunnels do not require a domain)

---

## 1. Security & Tokens

### Cloudflare Tunnel Security
- **Quick Tunnel:** Gives you a temporary random URL (`https://<random>.trycloudflare.com`). Keep the URL private; it connects directly to your local Ollama port.
- **Named Tunnel (Recommended):** Uses a Cloudflare Tunnel credential token (`--token <TUNNEL_TOKEN>`) configured via the Cloudflare Zero Trust dashboard or CLI.
- **Optional Bearer Token (`ODIN_CHAT_LLM_BEARER_TOKEN`):** If you run a local reverse proxy (like Caddy/Nginx) or Cloudflare Access Service Token in front of Ollama to validate `Authorization: Bearer <token>`, set this secret in Render. If routing directly to Ollama, you can leave it blank.

---

## 2. Deploy Backend to Render

1. Go to https://dashboard.render.com → **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:

| Field | Value |
|---|---|
| Root directory | `backend` |
| Runtime | Docker |
| Region | Closest to you (e.g., `Oregon (US West)` or `Frankfurt (EU Central)`) |
| Instance type | **Free** |
| Health check path | `/health` |

4. **Environment Variables** (add each):

| Key | Value | Notes |
|---|---|---|
| `ODIN_CHAT_LLM_URL` | *leave blank for now* | Will set after starting Cloudflare Tunnel (Step 5) |
| `ODIN_CHAT_LLM_MODEL` | `qwen2.5:3b` | Must match model pulled in your local Ollama |
| `ODIN_CHAT_LLM_BEARER_TOKEN` | *optional* | Secret token if using authenticated proxy/Access; leave blank if direct |
| `ODIN_CHAT_CORS_ORIGINS` | *leave blank for now* | Will set to your Vercel URL after Step 3 |
| `ODIN_CHAT_LLM_TIMEOUT` | `120` | Timeout in seconds |
| `ODIN_CHAT_RAG_ENABLED` | `true` | Enables RAG retrieval |

5. Click **Create Web Service** → wait for first deploy (~3-5 min)
6. Copy the Render URL: `https://<service-name>.onrender.com`

> **Cold start note:** Render free services spin down after 15 minutes of inactivity. The first request after sleep takes ~30–50 seconds.

---

## 3. Deploy Frontend to Vercel

1. Go to https://vercel.com/new → Import the same GitHub repository
2. Configure settings:

| Field | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | `frontend` |
| Build command | (default) `next build` |
| Output directory | (default) `.next` |

3. **Environment Variable** (Build-time, **set before clicking Deploy**):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_ODIN_CHAT_API_URL` | `https://<service-name>.onrender.com` (from Step 2) |

4. Click **Deploy** → wait ~2 min
5. Copy your assigned Vercel URL: `https://<project>.vercel.app`

---

## 4. Wire CORS & Tunnel URL (Back to Render)

1. In Render dashboard → your backend service → **Environment** tab
2. Update:
   - `ODIN_CHAT_CORS_ORIGINS` = `https://<project>.vercel.app` (from Step 3)
   - `ODIN_CHAT_LLM_URL` = *fill after Step 5*
3. Save changes → triggers an automatic redeploy

---

## 5. Local Machine: Setup Cloudflare Tunnel

### 5.1 Install `cloudflared`

```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Linux (Standalone binary fallback)
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# macOS
brew install cloudflared

# Windows: Download installer from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

---

### 5.2 Option A: Quick Tunnel (Instant, No Domain Required)

Best for quick testing without owning a domain:

```bash
cloudflared tunnel --url http://localhost:11434
```

Look for output containing:
```
Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):
https://<random-subdomain>.trycloudflare.com
```

1. Copy `https://<random-subdomain>.trycloudflare.com`
2. Go to Render Dashboard → Environment → Set `ODIN_CHAT_LLM_URL` to this URL → Save.

> ⚠️ **Note:** Quick tunnel URLs regenerate whenever you restart the process.

---

### 5.3 Option B: Named Tunnel (Stable URL, Requires Cloudflare Domain)

Best for a permanent URL:

```bash
# 1. Login to Cloudflare
cloudflared tunnel login

# 2. Create the tunnel
cloudflared tunnel create odin-chat

# 3. Create/edit configuration file ~/.cloudflared/config.yml:
```

```yaml
tunnel: odin-chat
credentials-file: /home/<your-user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ollama.yourdomain.com
    service: http://localhost:11434
  - service: http_status:404
```

```bash
# 4. Route DNS to the tunnel
cloudflared tunnel route dns odin-chat ollama.yourdomain.com

# 5. Run the tunnel
cloudflared tunnel run odin-chat
```

Use `https://ollama.yourdomain.com` as `ODIN_CHAT_LLM_URL` in Render.

---

## 6. Running the Stack (Daily Workflow)

When you want your deployed assistant to be online:

```bash
# Terminal 1: Ollama
ollama serve

# Terminal 2: Cloudflare Tunnel
cloudflared tunnel --url http://localhost:11434
# (or for named tunnel: cloudflared tunnel run odin-chat)
```

### Optional: systemd User Service (Auto-start on Boot)

Create `~/.config/systemd/user/ollama-tunnel.service`:

```ini
[Unit]
Description=Cloudflare Tunnel for Odin Chat
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --url http://localhost:11434
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Enable & start:
```bash
systemctl --user daemon-reload
systemctl --user enable --now ollama-tunnel
```

---

## 7. End-to-End Verification

Run these verification commands in order:

```bash
# 1. Verify Local Ollama is responsive
curl -s http://localhost:11434/api/tags | jq '.models[].name'

# 2. Verify Tunnel URL is reachable from internet
curl -s https://<your-tunnel-url>/api/tags | jq '.models[].name'

# 3. Verify Render backend health (allow 30-50s if waking from sleep)
curl -s https://<service-name>.onrender.com/health
# Expected output: {"status":"ok","ollama_available":true,"retrieval_available":true}

# 4. Verify Frontend
# Open https://<project>.vercel.app in your browser

# 5. Test Live Query
# Submit "What can you help me with?" in the chat UI and verify streaming responses
```

---

## 8. Failure Modes & Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| Render health: `ollama_available: false` | Tunnel down / laptop asleep / Ollama not running | Start `ollama serve` and `cloudflared tunnel`; check tunnel URL in Render |
| Browser CORS error | `ODIN_CHAT_CORS_ORIGINS` mismatch in Render | Ensure Render has `https://<project>.vercel.app` without trailing slash |
| First chat hangs ~45s then works | Render cold start (free tier) | Normal behavior on free tier; keep-alive ping can be set up via free cron-job.org |
| Model not found error / 503 | `ODIN_CHAT_LLM_MODEL` mismatch | Ensure Render `ODIN_CHAT_LLM_MODEL` matches the exact model name pulled in `ollama list` |
| `/chat/stream` closes mid-response | Ollama timeout on complex query | Increase `ODIN_CHAT_LLM_TIMEOUT` to `180` in Render |
| Open Library timeout | Rate-limited | Backend emits `notice` event and proceeds gracefully without citations |

---

## 9. Cost Summary (All Free)

| Layer | Tier | Free Quota |
|---|---|---|
| Vercel | Hobby | 100 GB bandwidth/mo, unlimited personal projects |
| Render | Free Web Service | 750 free instance hours/month |
| Cloudflare Tunnel | Free | Unlimited tunnels & bandwidth |
| Ollama | Local Hardware | Free (local compute) |
| Open Library | Public API | Free, rate-limited |
| **Total** | | **$0/month** |