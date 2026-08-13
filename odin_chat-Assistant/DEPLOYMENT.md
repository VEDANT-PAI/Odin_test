# Free Deployment Plan: Odin Chat Assistant

## Overview

Deploy the Odin Chat Assistant to a public URL for free while keeping the LLM on your laptop.

**Architecture:**
- **Frontend** → Vercel (Hobby tier, free)
- **Backend** → Render (Free Web Service)
- **LLM** → Ollama on your laptop
- **Laptop → Internet** → Cloudflare Tunnel with bearer token auth

All layers are free: Vercel Hobby, Render free web service, Cloudflare Tunnel free tier, Ollama on your hardware, no paid APIs.

---

## Prerequisites

- GitHub repo with this code pushed
- Free accounts: [Render](https://render.com), [Vercel](https://vercel.com), [Cloudflare](https://cloudflare.com)
- A domain on Cloudflare (for named tunnel) — optional, can use quick tunnel instead
- `ollama serve` running locally with `qwen3:0.6b` pulled

---

## 1. Generate Bearer Token (Do This First)

```bash
openssl rand -hex 32
```

Save this token — you'll use it in **three places**:
1. Render env var `ODIN_CHAT_LLM_BEARER_TOKEN` (mark as Secret)
2. Cloudflare Tunnel `--bearer-token` flag
3. Your password manager

---

## 2. Deploy Backend to Render

1. Go to https://dashboard.render.com → **New +** → **Web Service**
2. Connect your GitHub repo
3. Configure:

| Field | Value |
|---|---|
| Root directory | `backend` |
| Runtime | Docker |
| Region | Closest to you (e.g., `Oregon (US West)`) |
| Instance type | **Free** |
| Health check path | `/health` |

4. **Environment Variables** (add each, mark secrets where noted):

| Key | Value | Secret? |
|---|---|---|
| `ODIN_CHAT_LLM_URL` | *leave blank for now* | No |
| `ODIN_CHAT_LLM_MODEL` | `qwen3:0.6b` | No |
| `ODIN_CHAT_LLM_BEARER_TOKEN` | *paste token from Step 1* | **Yes** |
| `ODIN_CHAT_CORS_ORIGINS` | *leave blank for now* | No |
| `ODIN_CHAT_LLM_TIMEOUT` | `120` | No |

5. Click **Create Web Service** → wait for first deploy (~3-5 min)
6. Copy the Render URL: `https://<service-name>.onrender.com`

> **Cold start note:** Render free services sleep after 15 min idle. First request after sleep takes 30–50 s.

---

## 3. Deploy Frontend to Vercel

1. Go to https://vercel.com/new → Import the same GitHub repo
2. Settings:

| Field | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | `frontend` |
| Build command | (default) `next build` |
| Output directory | (default) `.next` |

3. **Environment Variable** (Build-time, **set before first build**):

| Key | Value |
|---|---|
| `NEXT_PUBLIC_ODIN_CHAT_API_URL` | `https://<service-name>.onrender.com` (from Step 2) |

4. Click **Deploy** → wait ~2 min
5. Copy the Vercel URL: `https://<project>.vercel.app`

---

## 4. Wire CORS & Tunnel URL (Back to Render)

1. In Render dashboard → your backend service → **Environment** tab
2. Update:
   - `ODIN_CHAT_CORS_ORIGINS` = `https://<project>.vercel.app` (from Step 3)
   - `ODIN_CHAT_LLM_URL` = *will fill after Step 5*
3. Save → triggers auto-redeploy

---

## 5. Laptop: Cloudflare Tunnel

### 5.1 Install cloudflared

```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# macOS
brew install cloudflared

# Windows: Download installer from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

### 5.2 Option A: Quick Tunnel (No Domain, URL Changes on Restart)

```bash
cloudflared tunnel --no-autoupdate --bearer-token "<YOUR_TOKEN>" --url http://localhost:11434
```

Output shows: `https://<random>.trycloudflare.com`

Copy that URL → Render env var `ODIN_CHAT_LLM_URL` → Save → redeploys.

> ⚠️ **Quick tunnel URL changes every restart.** Only for testing.

### 5.3 Option B: Named Tunnel (Stable URL, Requires Domain on Cloudflare)

```bash
# One-time setup
cloudflared tunnel login                    # picks a domain in your Cloudflare account
cloudflared tunnel create odin-chat
```

Edit `~/.cloudflared/config.yml`:

```yaml
tunnel: odin-chat
credentials-file: /home/<your-user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ollama.yourdomain.com
    service: http://localhost:11434
  - service: http_status:404
```

```bash
cloudflared tunnel route dns odin-chat ollama.yourdomain.com
```

Run it:

```bash
cloudflared tunnel --bearer-token "<YOUR_TOKEN>" run odin-chat
```

Use `https://ollama.yourdomain.com` as `ODIN_CHAT_LLM_URL` in Render.

---

## 6. Run the Stack (Every Session)

```bash
# Terminal 1
ollama serve

# Terminal 2 (or tmux/screen/systemd)
cloudflared tunnel --bearer-token "<YOUR_TOKEN>" run odin-chat   # or quick-tunnel command
```

### Optional: systemd User Service (Auto-start on Login)

Create `~/.config/systemd/user/ollama-tunnel.service`:

```ini
[Unit]
Description=Cloudflare Tunnel for Odin Chat
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --bearer-token "<YOUR_TOKEN>" run odin-chat
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

Run in order. If any fails, see "Failure Modes" below.

```bash
# 1. Local Ollama alive
curl -s http://localhost:11434/api/tags | jq '.models[].name'
# Should list qwen3:0.6b

# 2. Tunnel with token works
curl -s -H "Authorization: Bearer <TOKEN>" https://ollama.yourdomain.com/api/tags | jq '.models[].name'
# Without token → HTTP 401

# 3. Render backend alive (may take 30-50s on cold start)
curl -s https://<service>.onrender.com/health
# {"status":"ok","ollama_available":true,"retrieval_available":true}

# 4. Frontend loads
# Open https://<project>.vercel.app in browser

# 5. Full chat round-trip
# Type "What can you help me with?" → citations + streaming tokens appear
```

---

## 8. Failure Modes & Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| `cloudflared` returns 401 | Token mismatch | Regenerate token, update both `cloudflared --bearer-token` and Render env var |
| Render health: `ollama_available: false` | Tunnel down / laptop asleep | Wake laptop; check `cloudflared` & `ollama serve` running |
| Browser CORS error | `ODIN_CHAT_CORS_ORIGINS` not set to Vercel URL | Set it in Render, save → redeploys |
| First chat hangs ~45s then works | Render cold start (free tier) | Expected. Or ping `/health` every 10 min via cron-job.org |
| Tunnel URL changed (quick tunnel) | Tunnel restarted | Update Render `ODIN_CHAT_LLM_URL`, redeploy. Switch to named tunnel |
| `/chat/stream` closes mid-response | Ollama timeout on slow laptop | Bump `ODIN_CHAT_LLM_TIMEOUT` to 180 in Render; lower `max_output_tokens` |
| Open Library timeout | Rate-limited | Backend already emits `notice` event and continues without citations |

---

## 9. Cost Summary (All Free)

| Layer | Tier | Free Quota |
|---|---|---|
| Vercel | Hobby | 100 GB bandwidth/mo, unlimited projects |
| Render | Free Web Service | 750 hrs/mo, sleeps after 15 min idle |
| Cloudflare Tunnel | Free | Unlimited tunnels, unlimited bandwidth |
| Ollama | Your laptop | Free (electricity only) |
| Open Library | Public | Free, rate-limited |
| **Total** | | **$0/mo** |

---

## 10. Checklist

### One-Time (Do Once)
- [ ] Generate bearer token (`openssl rand -hex 32`)
- [ ] Push code changes to GitHub
- [ ] Create Render Web Service, set env vars
- [ ] Create Vercel project, set `NEXT_PUBLIC_ODIN_CHAT_API_URL`
- [ ] Copy Vercel URL → Render `ODIN_CHAT_CORS_ORIGINS`, redeploy
- [ ] Install `cloudflared` on laptop
- [ ] Create named tunnel (or quick tunnel), point DNS
- [ ] Set Render `ODIN_CHAT_LLM_URL` to tunnel URL, redeploy

### Per Session (Every Laptop Reboot)
- [ ] Start `ollama serve`
- [ ] Start `cloudflared tunnel --bearer-token "<TOKEN>" run odin-chat`

### Recurring Maintenance
- **Zero.** Keep laptop awake with tunnel running.

---

## 11. Code Changes Already in Repo

The following changes from the deployment plan are **already implemented**:

| File | Change |
|---|---|
| `backend/app/config.py` | Added `llm_bearer_token: str = ""` |
| `backend/app/ollama.py` | Added `_auth_headers()` method, used in `status()` and `stream()` |
| `backend/app/main.py` | Startup log of Ollama reachability in `lifespan` |
| `.env.example` | Added `ODIN_CHAT_LLM_BEARER_TOKEN=` line |

No further code changes needed for this deployment.