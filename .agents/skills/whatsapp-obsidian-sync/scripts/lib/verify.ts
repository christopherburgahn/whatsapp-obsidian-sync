import assert from "node:assert/strict";
import { buildFetchOutput } from "./pull.js";
import { renderPull } from "./rendering.js";
import { isAudioMimeType } from "./transcription.js";
import type { AppConfig } from "./config.js";
import type { FetchOutput } from "./pull.js";
import type { WahaMessage } from "./waha.js";
import { resolveMediaUrl } from "./waha.js";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    wahaBaseUrl: "http://waha.local",
    wahaApiKey: "secret",
    wahaSession: "default",
    vaultPath: "/vault",
    syncSubfolder: "WhatsApp",
    lookbackDays: 7,
    minMessagesPerChat: 5,
    fetchLimitPerChat: 200,
    chatsOverviewLimit: 100,
    chatAllowlist: [],
    chatDenylist: ["status@broadcast"],
    logLevel: "info",
    openaiApiKey: undefined,
    openaiTranscribeModel: "gpt-4o-transcribe",
    transcribeAudio: false,
    ...overrides,
  };
}

function message(ts = Math.floor(Date.now() / 1000) - 60, overrides: Partial<WahaMessage> = {}): WahaMessage {
  return {
    id: "m1",
    timestamp: ts,
    fromMe: false,
    body: "",
    hasMedia: true,
    ...overrides,
  };
}

async function verifyTranscriptionFlow(): Promise<void> {
  const calls: string[] = [];
  const ts = Math.floor(Date.now() / 1000) - 60;
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: ts },
        },
      ];
    },
    async messagesSince() {
      return [message(ts)];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      calls.push("messageById");
      return message(ts, {
        media: {
          url: "https://waha.local/api/files/voice.ogg",
          mimetype: "audio/ogg",
          filename: "voice.ogg",
        },
      });
    },
    async downloadMedia() {
      calls.push("downloadMedia");
      return {
        bytes: new Uint8Array([1, 2, 3]),
        size: 3,
        contentType: "audio/ogg",
      };
    },
  };

  const output = await buildFetchOutput(baseConfig({ transcribeAudio: true, openaiApiKey: "sk-test" }), {
    client,
    transcribeAudio: async () => ({ text: "Hallo zusammen" }),
  });

  assert.equal(output.chats.length, 1);
  assert.equal(calls.includes("messageById"), true);
  assert.equal(calls.includes("downloadMedia"), true);
  assert.equal(output.chats[0]?.messages[0]?.media?.transcriptionStatus, "transcribed");
  assert.equal(output.chats[0]?.messages[0]?.media?.transcript, "Hallo zusammen");
}

async function verifyMissingKeyBehavior(): Promise<void> {
  let transcribeCalled = false;
  let messageByIdCalled = false;
  const ts = Math.floor(Date.now() / 1000) - 60;
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: ts },
        },
      ];
    },
    async messagesSince() {
      return [message(ts)];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      messageByIdCalled = true;
      return message(ts, {
        media: {
          url: "https://waha.local/api/files/voice.ogg",
          mimetype: "audio/ogg",
        },
      });
    },
    async downloadMedia() {
      return {
        bytes: new Uint8Array([1, 2, 3]),
        size: 3,
        contentType: "audio/ogg",
      };
    },
  };

  const output = await buildFetchOutput(baseConfig({ transcribeAudio: true }), {
    client,
    transcribeAudio: async () => {
      transcribeCalled = true;
      return { text: "should not run" };
    },
  });

  assert.equal(transcribeCalled, false);
  assert.equal(messageByIdCalled, false);
  assert.equal(output.chats[0]?.messages[0]?.hasMedia, true);
  assert.equal(output.chats[0]?.messages[0]?.media, undefined);
}

async function verifyOversizeBehavior(): Promise<void> {
  let transcribeCalled = false;
  const ts = Math.floor(Date.now() / 1000) - 60;
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: ts },
        },
      ];
    },
    async messagesSince() {
      return [message(ts)];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      return message(ts, {
        media: {
          url: "https://waha.local/api/files/voice.ogg",
          mimetype: "audio/ogg",
          filename: "voice.ogg",
        },
      });
    },
    async downloadMedia() {
      return {
        bytes: new Uint8Array(25 * 1024 * 1024 + 1),
        size: 25 * 1024 * 1024 + 1,
        contentType: "audio/ogg",
      };
    },
  };

  const output = await buildFetchOutput(baseConfig({ transcribeAudio: true, openaiApiKey: "sk-test" }), {
    client,
    transcribeAudio: async () => {
      transcribeCalled = true;
      return { text: "should not run" };
    },
  });

  assert.equal(transcribeCalled, false);
  assert.equal(output.chats[0]?.messages[0]?.media?.transcriptionStatus, "skipped");
  assert.match(output.chats[0]?.messages[0]?.media?.transcriptionError ?? "", /larger than/);
}

function verifyRendering(): void {
  const output: FetchOutput = {
    config: {
      vaultPath: "/vault",
      subfolder: "WhatsApp",
      wahaSession: "default",
      me: { id: "me@c.us" },
      filters: { allowlist: [], denylist: [], appliedReason: "CHAT_DENYLIST active" },
      window: { days: 7, start: 1714000000, end: 1714600000 },
      minMessagesPerChat: 5,
    },
    fetchedAt: 1714600000,
    skipped: [],
    chats: [
      {
        chatId: "123@c.us",
        name: "Alice",
        isGroup: false,
        inWindowCount: 2,
        paddedWithOlder: 0,
        messageCount: 2,
        messages: [
          {
            id: "m1",
            timestamp: 1714590000,
            fromMe: false,
            sender: { name: "Alice", id: "123@c.us" },
            inWindow: true,
            body: "",
            hasMedia: true,
            media: {
              kind: "audio",
              mimetype: "audio/ogg",
              filename: "voice.ogg",
              transcriptionStatus: "transcribed",
              transcript: "Hallo\nWelt",
            },
          },
          {
            id: "m2",
            timestamp: 1714593600,
            fromMe: true,
            sender: { name: "me", id: "me@c.us" },
            inWindow: true,
            body: "Klar",
            hasMedia: false,
          },
        ],
      },
    ],
  };

  const rendered = renderPull(output).markdown;

  assert.match(rendered, /\*\[audio\]\*/);
  assert.match(rendered, /> Transcript:/);
  assert.match(rendered, /> Hallo/);
  assert.match(rendered, /Klar/);
}

function verifyMediaUrlRewrite(): void {
  assert.equal(
    resolveMediaUrl("http://localhost:3000/api/files/default/voice.ogg", "https://waha.example.com"),
    "https://waha.example.com/api/files/default/voice.ogg",
  );
  assert.equal(
    resolveMediaUrl("https://waha.example.com/api/files/default/voice.ogg", "https://waha.example.com"),
    "https://waha.example.com/api/files/default/voice.ogg",
  );
}

async function main(): Promise<void> {
  assert.equal(isAudioMimeType("audio/ogg"), true);
  assert.equal(isAudioMimeType("image/png"), false);
  verifyMediaUrlRewrite();
  verifyRendering();
  await verifyTranscriptionFlow();
  await verifyMissingKeyBehavior();
  await verifyOversizeBehavior();
  process.stdout.write("verification passed\n");
}

main().catch((err) => {
  process.stderr.write(`verification failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
