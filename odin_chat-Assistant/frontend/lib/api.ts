import type { Citation, Message, ModelStatus } from "./types";

const API_URL = process.env.NEXT_PUBLIC_ODIN_CHAT_API_URL ?? "http://localhost:8010";

export async function modelStatus(): Promise<ModelStatus> {
  const response = await fetch(`${API_URL}/models/status`, { cache: "no-store" });
  if (!response.ok) throw new Error("Odin Chat API is unavailable.");
  return response.json();
}

type StreamHandlers = { onCitations: (items: Citation[]) => void; onToken: (text: string) => void; onThinking: (text: string) => void; onNotice: (message: string) => void; onError: (message: string) => void };

export async function streamChat(message: string, history: Message[], controller: AbortController, handlers: StreamHandlers, think = false): Promise<void> {
  const response = await fetch(`${API_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({ message, history: history.slice(-12).map(({ role, content }) => ({ role, content })), think }),
  });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({ detail: "The chat service is unavailable." }));
    throw new Error(error.detail ?? "The chat service is unavailable.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return;
    buffer += decoder.decode(chunk.value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const type = event.match(/^event: (.+)$/m)?.[1];
      const data = event.match(/^data: (.+)$/m)?.[1];
      if (!type || !data) continue;
      const payload = JSON.parse(data) as { text?: string; message?: string; items?: Citation[] };
      if (type === "citations") handlers.onCitations(payload.items ?? []);
      if (type === "token") handlers.onToken(payload.text ?? "");
      if (type === "thinking") handlers.onThinking(payload.text ?? "");
      if (type === "notice") handlers.onNotice(payload.message ?? "");
      if (type === "error") handlers.onError(payload.message ?? "Response failed.");
    }
  }
}
