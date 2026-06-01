import test from "node:test";
import assert from "node:assert/strict";
import { buildFetchOutput } from "./pull.js";
import type { AppConfig } from "./config.js";
import type { WahaMessage } from "./waha.js";

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

function message(overrides: Partial<WahaMessage> = {}): WahaMessage {
  return {
    id: "m1",
    timestamp: 1714590000,
    fromMe: false,
    body: "",
    hasMedia: true,
    ...overrides,
  };
}

test("buildFetchOutput transcribes audio messages inline when enabled", async () => {
  const calls: string[] = [];
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: 1714590000 },
        },
      ];
    },
    async messagesSince() {
      return [message()];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      calls.push("messageById");
      return message({
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
});

test("buildFetchOutput skips transcription when no OpenAI key is configured", async () => {
  let transcribeCalled = false;
  let messageByIdCalled = false;
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: 1714590000 },
        },
      ];
    },
    async messagesSince() {
      return [message()];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      messageByIdCalled = true;
      return message({
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
});

test("buildFetchOutput skips oversized audio without aborting", async () => {
  let transcribeCalled = false;
  const client = {
    async getSession() {
      return { me: { id: "me@c.us" } };
    },
    async chatsOverview() {
      return [
        {
          id: "123@c.us",
          name: "Voice",
          lastMessage: { id: "m1", timestamp: 1714590000 },
        },
      ];
    },
    async messagesSince() {
      return [message()];
    },
    async lastMessages() {
      return [];
    },
    async messageById() {
      return message({
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
});
