export type Role = "user" | "assistant";

export type Citation = {
  key: string;
  title: string;
  authors: string[];
  year: number | null;
  language: string[];
  url: string;
  cover_url: string | null;
  facts: Record<string, string | number | string[] | null>;
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
  createdAt: number;
  error?: boolean;
  thinking?: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};

export type ModelStatus = { configured_model: string; available: boolean; installed_models: string[] };
