import test from "node:test";
import assert from "node:assert/strict";
import { renderPull } from "./rendering.js";
import type { FetchOutput } from "./pull.js";

test("renderPull renders inline audio transcript without breaking normal text", () => {
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
});
