import type { AppConfig } from "./config.js";

export interface WahaLastMessage {
  id: string;
  timestamp: number;
  from?: string;
  fromMe?: boolean;
  body?: string;
}

export interface WahaMedia {
  url?: string;
  mimetype?: string | null;
  filename?: string | null;
  error?: string | null;
}

export interface WahaChatOverview {
  id: string;
  name?: string | null;
  picture?: string | null;
  lastMessage?: WahaLastMessage | null;
}

export interface WahaMessage {
  id: string;
  timestamp: number;
  from?: string;
  fromMe?: boolean;
  body?: string;
  hasMedia?: boolean;
  media?: WahaMedia | null;
  ack?: number;
  ackName?: string;
  replyTo?: unknown;
  participant?: string | null;
  _data?: {
    Info?: {
      PushName?: string;
      Sender?: string;
      SenderAlt?: string;
      IsGroup?: boolean;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface WahaSessionMe {
  id: string;
  pushName?: string;
  lid?: string;
}

export interface WahaSession {
  name: string;
  status: string;
  me?: WahaSessionMe | null;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function resolveMediaUrl(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  const base = new URL(baseUrl);

  if (LOOPBACK_HOSTS.has(parsed.hostname) && parsed.origin !== base.origin) {
    parsed.protocol = base.protocol;
    parsed.hostname = base.hostname;
    parsed.port = base.port;
  }

  return parsed.toString();
}

export class WahaClient {
  constructor(private readonly config: AppConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.config.wahaBaseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "X-Api-Key": this.config.wahaApiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `WAHA ${init.method ?? "GET"} ${path} -> ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
      );
    }
    return (await response.json()) as T;
  }

  async getSession(): Promise<WahaSession | null> {
    const sessions = await this.request<WahaSession[]>("/api/sessions");
    return sessions.find((s) => s.name === this.config.wahaSession) ?? null;
  }

  async chatsOverview(limit: number, offset = 0): Promise<WahaChatOverview[]> {
    const session = encodeURIComponent(this.config.wahaSession);
    const path = `/api/${session}/chats/overview?limit=${limit}&offset=${offset}`;
    return this.request<WahaChatOverview[]>(path);
  }

  async messagesSince(chatId: string, sinceTimestamp: number, limit: number): Promise<WahaMessage[]> {
    const session = encodeURIComponent(this.config.wahaSession);
    const encodedChatId = encodeURIComponent(chatId);
    const params = new URLSearchParams({
      limit: String(limit),
      downloadMedia: "false",
      "filter.timestamp.gte": String(sinceTimestamp),
    });
    const path = `/api/${session}/chats/${encodedChatId}/messages?${params.toString()}`;
    return this.request<WahaMessage[]>(path);
  }

  /** Fetch the last N messages in a chat regardless of timestamp. Used to pad sparse chats up to min count. */
  async lastMessages(chatId: string, limit: number): Promise<WahaMessage[]> {
    const session = encodeURIComponent(this.config.wahaSession);
    const encodedChatId = encodeURIComponent(chatId);
    const params = new URLSearchParams({
      limit: String(limit),
      downloadMedia: "false",
    });
    const path = `/api/${session}/chats/${encodedChatId}/messages?${params.toString()}`;
    return this.request<WahaMessage[]>(path);
  }

  async messageById(chatId: string, messageId: string, downloadMedia = true): Promise<WahaMessage> {
    const session = encodeURIComponent(this.config.wahaSession);
    const encodedChatId = encodeURIComponent(chatId);
    const encodedMessageId = encodeURIComponent(messageId);
    const params = new URLSearchParams({
      downloadMedia: downloadMedia ? "true" : "false",
    });
    const path = `/api/${session}/chats/${encodedChatId}/messages/${encodedMessageId}?${params.toString()}`;
    return this.request<WahaMessage>(path);
  }

  async downloadMedia(url: string): Promise<{ bytes: Uint8Array; size: number; contentType?: string | null }> {
    const resolvedUrl = resolveMediaUrl(url, this.config.wahaBaseUrl);
    const response = await fetch(resolvedUrl, {
      headers: {
        "X-Api-Key": this.config.wahaApiKey,
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`WAHA GET ${resolvedUrl} -> ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      bytes,
      size: bytes.byteLength,
      contentType: response.headers.get("content-type"),
    };
  }
}
