import type { Conversation } from "./types";

const KEY = "odin-chat-assistant:v1";

export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((chat): chat is Conversation => Boolean(chat && typeof chat === "object" && "id" in chat && "messages" in chat));
  } catch { return []; }
}

export function saveConversations(conversations: Conversation[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(conversations.slice(0, 50)));
}

export function clearConversations(): void {
  window.localStorage.removeItem(KEY);
}
