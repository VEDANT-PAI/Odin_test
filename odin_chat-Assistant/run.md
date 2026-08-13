 How to run it locally

  # 1. Make sure Ollama is running and you have a model pulled
  ollama serve &                 # if not already running
  ollama pull qwen2.5:3b         # or any other chat model

  # 2. Backend
  cd backend
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  uvicorn app.main:app --host 0.0.0.0 --port 8010

  # 3. Frontend (new terminal)
  cd frontend
  npm install
  npm run dev    # http://localhost:3001

  The frontend reads NEXT_PUBLIC_ODIN_CHAT_API_URL (defaults to http://localhost:8010). Everything in .env.example works as-is once the Ollama model name
  is set to one you actually have.

✻ Crunched for 3m 54s

※ recap: I tested the Odin Chat Assistant end-to-end and it's working. The only blocker is a model name mismatch — your README expects qwen2.5:3b but you 
  have qwen3:0.6b pulled; next step is to set ODIN_CHAT_LLM_MODEL=qwen3:0.6b in .env and start the app. (disable recaps in /config)
