import type { AppConfig } from "./config.js";
import { describeError, type Logger } from "./logger.js";
import { resolveSender, type ResolvedSender } from "./sender.js";
import { WahaClient, type WahaMessage, type WahaSessionMe } from "./waha.js";
import { isAudioMimeType, OPENAI_TRANSCRIPTION_MAX_BYTES, transcribeAudio } from "./transcription.js";

export interface NormalizedMessage {
  id: string;
  timestamp: number;
  fromMe: boolean;
  sender: ResolvedSender;
  inWindow: boolean;
  body: string;
  hasMedia: boolean;
  media?: {
    kind: "audio" | "other";
    mimetype?: string | null;
    filename?: string | null;
    url?: string | null;
    transcriptionStatus: "not-attempted" | "disabled" | "not-audio" | "transcribed" | "skipped" | "failed";
    transcript?: string;
    transcriptionError?: string;
    transcriptionModel?: string;
  };
  ack?: number;
  ackName?: string;
  replyTo?: {
    id?: string;
    participant?: string;
    authorName?: string;
    body?: string;
    hasMedia?: boolean;
  } | null;
}

export interface PullDependencies {
  logger?: Logger;
  client?: {
    getSession(): Promise<{ me?: WahaSessionMe | null } | null>;
    chatsOverview(limit: number, offset?: number): Promise<{ id: string; name?: string | null; picture?: string | null; lastMessage?: { id: string; timestamp: number } | null }[]>;
    messagesSince(chatId: string, sinceTimestamp: number, limit: number): Promise<WahaMessage[]>;
    lastMessages(chatId: string, limit: number): Promise<WahaMessage[]>;
    messageById(chatId: string, messageId: string, downloadMedia?: boolean): Promise<WahaMessage>;
    downloadMedia(url: string): Promise<{ bytes: Uint8Array; size: number; contentType?: string | null }>;
  };
  transcribeAudio?: typeof transcribeAudio;
}

export interface ChatBundle {
  chatId: string;
  name: string | null;
  isGroup: boolean;
  inWindowCount: number;
  paddedWithOlder: number;
  messageCount: number;
  messages: NormalizedMessage[];
}

export interface FetchOutput {
  config: {
    vaultPath: string;
    subfolder: string;
    wahaSession: string;
    me: WahaSessionMe | null;
    filters: {
      allowlist: string[];
      denylist: string[];
      appliedReason: string;
    };
    window: {
      days: number;
      start: number;
      end: number;
    };
    minMessagesPerChat: number;
  };
  fetchedAt: number;
  skipped: { chatId: string; name?: string | null; reason: string }[];
  chats: ChatBundle[];
}

function shouldIncludeChat(chatId: string, config: AppConfig): { ok: boolean; reason?: string } {
  if (config.chatAllowlist.length > 0) {
    return config.chatAllowlist.includes(chatId)
      ? { ok: true }
      : { ok: false, reason: "not in CHAT_ALLOWLIST" };
  }
  if (config.chatDenylist.includes(chatId)) {
    return { ok: false, reason: "in CHAT_DENYLIST" };
  }
  return { ok: true };
}

function dedupeById(messages: WahaMessage[]): WahaMessage[] {
  const seen = new Set<string>();
  const out: WahaMessage[] = [];
  for (const m of messages) {
    if (!m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/** Resolve replyTo.participant -> a display name by scanning other messages in the same chat. */
function resolveReplyAuthor(
  participant: string | undefined,
  pool: NormalizedMessage[],
  me: WahaSessionMe | null,
): string | undefined {
  if (!participant) return undefined;
  if (me && (participant === me.id || participant === me.lid)) return "me";
  for (const m of pool) {
    if (m.sender.id === participant && m.sender.name && m.sender.name !== "unknown") {
      return m.sender.name;
    }
  }
  return undefined;
}

function normalizeOne(
  chatId: string,
  chatName: string | null,
  raw: WahaMessage,
  me: WahaSessionMe | null,
  windowStart: number,
  enrichedMedia?: NormalizedMessage["media"],
): NormalizedMessage {
  const replyToRaw = raw.replyTo as
    | { id?: string; participant?: string; body?: string; hasMedia?: boolean }
    | null
    | undefined;
  const media = raw.media ?? null;
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    fromMe: Boolean(raw.fromMe),
    sender: resolveSender(chatId, chatName, raw, me),
    inWindow: raw.timestamp >= windowStart,
    body: typeof raw.body === "string" ? raw.body : "",
    hasMedia: Boolean(raw.hasMedia),
    ...(enrichedMedia
      ? {
          media: enrichedMedia,
        }
      : media
        ? {
            media: {
              kind: isAudioMimeType(media.mimetype) ? "audio" : "other",
              mimetype: media.mimetype ?? undefined,
              filename: media.filename ?? undefined,
              url: media.url ?? undefined,
              transcriptionStatus: "not-attempted" as const,
            },
          }
        : {}),
    ...(raw.ack !== undefined ? { ack: raw.ack } : {}),
    ...(raw.ackName !== undefined ? { ackName: raw.ackName } : {}),
    ...(replyToRaw
      ? {
          replyTo: {
            ...(replyToRaw.id ? { id: replyToRaw.id } : {}),
            ...(replyToRaw.participant ? { participant: replyToRaw.participant } : {}),
            ...(replyToRaw.body ? { body: replyToRaw.body } : {}),
            ...(replyToRaw.hasMedia !== undefined ? { hasMedia: replyToRaw.hasMedia } : {}),
          },
        }
      : {}),
  };
}

async function enrichAudioMedia(
  client: NonNullable<PullDependencies["client"]>,
  config: AppConfig,
  chatId: string,
  rawMessages: WahaMessage[],
  transcribe: typeof transcribeAudio,
  logger: Logger,
): Promise<Map<string, NonNullable<NormalizedMessage["media"]>>> {
  const out = new Map<string, NonNullable<NormalizedMessage["media"]>>();
  if (!config.transcribeAudio || !config.openaiApiKey) return out;

  for (const raw of rawMessages) {
    if (!raw.hasMedia) continue;

    const full = await client.messageById(chatId, raw.id, true);
    const media = full.media ?? raw.media ?? null;
    const mimetype = media?.mimetype ?? null;
    const filename = media?.filename ?? null;
    const url = media?.url ?? null;

    const base: NonNullable<NormalizedMessage["media"]> = {
      kind: isAudioMimeType(mimetype) ? "audio" : "other",
      mimetype: mimetype ?? undefined,
      filename: filename ?? undefined,
      url: url ?? undefined,
      transcriptionStatus: "not-attempted" as const,
    };

    if (!media) {
      logger.warn(`Chat ${chatId} message ${raw.id}: missing media payload.`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "skipped",
        transcriptionError: "missing media payload",
      });
      continue;
    }

    if (!isAudioMimeType(mimetype)) {
      logger.debug(`Chat ${chatId} message ${raw.id}: media type ${mimetype ?? "unknown"} is not audio.`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "not-audio",
      });
      continue;
    }

    if (media?.error) {
      logger.warn(`Chat ${chatId} message ${raw.id}: WAHA media error: ${media.error}`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "skipped",
        transcriptionError: String(media.error),
      });
      continue;
    }

    if (!url) {
      logger.warn(`Chat ${chatId} message ${raw.id}: missing media.url.`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "skipped",
        transcriptionError: "missing media.url",
      });
      continue;
    }

    let downloaded: { bytes: Uint8Array; size: number; contentType?: string | null };
    try {
      downloaded = await client.downloadMedia(url);
    } catch (err) {
      logger.warn(`Chat ${chatId} message ${raw.id}: media download failed from ${url}: ${describeError(err)}`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "failed",
        transcriptionError: `media download failed: ${describeError(err)}`,
      });
      continue;
    }

    if (downloaded.size > OPENAI_TRANSCRIPTION_MAX_BYTES) {
      logger.warn(
        `Chat ${chatId} message ${raw.id}: audio file is ${downloaded.size} bytes, above the ${OPENAI_TRANSCRIPTION_MAX_BYTES}-byte transcription limit.`,
      );
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "skipped",
        transcriptionError: `media larger than ${OPENAI_TRANSCRIPTION_MAX_BYTES} bytes`,
      });
      continue;
    }

    try {
      const transcript = await transcribe({
        apiKey: config.openaiApiKey,
        model: config.openaiTranscribeModel,
        fileName: filename ?? `${raw.id}.ogg`,
        bytes: downloaded.bytes,
        mimeType: downloaded.contentType ?? mimetype ?? undefined,
      });

      logger.debug(
        `Chat ${chatId} message ${raw.id}: transcribed ${downloaded.size} bytes with ${config.openaiTranscribeModel}.`,
      );
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "transcribed",
        transcript: transcript.text,
        transcriptionModel: config.openaiTranscribeModel,
      });
    } catch (err) {
      logger.warn(`Chat ${chatId} message ${raw.id}: transcription failed: ${describeError(err)}`);
      out.set(raw.id, {
        ...base,
        transcriptionStatus: "failed",
        transcriptionError: describeError(err),
      });
    }
  }

  return out;
}

export async function buildFetchOutput(
  config: AppConfig,
  deps: PullDependencies = {},
): Promise<FetchOutput> {
  const client = deps.client ?? new WahaClient(config);
  const logger = deps.logger ?? { debug() {}, info() {}, warn() {}, error() {} };
  const transcribe = deps.transcribeAudio ?? transcribeAudio;
  const session = await client.getSession();
  const me = session?.me ?? null;

  if (!config.transcribeAudio) {
    logger.info("Audio transcription disabled.");
  } else if (!config.openaiApiKey) {
    logger.warn("Audio transcription requested, but OPENAI_API_KEY is missing.");
  } else {
    logger.info(`Audio transcription enabled with model ${config.openaiTranscribeModel}.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.lookbackDays * 24 * 60 * 60;

  const chats = await client.chatsOverview(config.chatsOverviewLimit, 0);
  const bundles: ChatBundle[] = [];
  const skipped: FetchOutput["skipped"] = [];

  for (const chat of chats) {
    const filter = shouldIncludeChat(chat.id, config);
    if (!filter.ok) {
      skipped.push({ chatId: chat.id, name: chat.name ?? null, reason: filter.reason ?? "filtered" });
      continue;
    }

    const lastTs = chat.lastMessage?.timestamp ?? 0;
    if (lastTs < windowStart) {
      // inactive chat: no activity in the window
      continue;
    }

    let raw = await client.messagesSince(chat.id, windowStart, config.fetchLimitPerChat);
    raw = dedupeById(raw).filter((m) => typeof m.timestamp === "number");
    const inWindowCount = raw.length;

    let paddedWithOlder = 0;
    if (inWindowCount < config.minMessagesPerChat && config.minMessagesPerChat > 0) {
      // pull the last N messages as padding (some will overlap, dedupe)
      const padSource = await client.lastMessages(chat.id, config.minMessagesPerChat);
      const before = raw.length;
      raw = dedupeById(raw.concat(padSource.filter((m) => typeof m.timestamp === "number")));
      // keep only the newest minMessagesPerChat messages across the merged set
      raw.sort((a, b) => b.timestamp - a.timestamp);
      raw = raw.slice(0, config.minMessagesPerChat);
      paddedWithOlder = raw.length - before;
      if (paddedWithOlder < 0) paddedWithOlder = 0;
    }

    if (raw.length === 0) continue;

    raw.sort((a, b) => a.timestamp - b.timestamp);

    const mediaByMessageId = await enrichAudioMedia(client, config, chat.id, raw, transcribe, logger);
    const normalized = raw.map((m) =>
      normalizeOne(chat.id, chat.name ?? null, m, me, windowStart, mediaByMessageId.get(m.id)),
    );

    // Resolve replyTo authorName using visible messages in the same chat
    for (const m of normalized) {
      if (m.replyTo?.participant) {
        const name = resolveReplyAuthor(m.replyTo.participant, normalized, me);
        if (name) m.replyTo.authorName = name;
      }
    }

    bundles.push({
      chatId: chat.id,
      name: chat.name ?? null,
      isGroup: chat.id.endsWith("@g.us"),
      inWindowCount,
      paddedWithOlder,
      messageCount: normalized.length,
      messages: normalized,
    });
  }

  // sort bundles by most recent last message first
  bundles.sort((a, b) => {
    const at = a.messages[a.messages.length - 1]?.timestamp ?? 0;
    const bt = b.messages[b.messages.length - 1]?.timestamp ?? 0;
    return bt - at;
  });

  return {
    config: {
      vaultPath: config.vaultPath,
      subfolder: config.syncSubfolder,
      wahaSession: config.wahaSession,
      me,
      filters: {
        allowlist: config.chatAllowlist,
        denylist: config.chatDenylist,
        appliedReason:
          config.chatAllowlist.length > 0
            ? "CHAT_ALLOWLIST active; denylist ignored"
            : "CHAT_DENYLIST active",
      },
      window: {
        days: config.lookbackDays,
        start: windowStart,
        end: now,
      },
      minMessagesPerChat: config.minMessagesPerChat,
    },
    fetchedAt: now,
    skipped,
    chats: bundles,
  };
}
