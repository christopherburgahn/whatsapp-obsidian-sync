import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ChatBundle, FetchOutput, NormalizedMessage } from "./pull.js";

const REPLY_TRUNCATE = 100;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(ts: number): { date: string; time: string; iso: string } {
  const d = new Date(ts * 1000);
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    iso: localIso(d),
  };
}

function localIso(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
}

function truncate(s: string, n: number): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  if (collapsed.length <= n) return collapsed;
  return `${collapsed.slice(0, n - 1)}...`;
}

function renderTranscript(transcript: string): string[] {
  const lines = transcript.trim().split("\n");
  return ["  > Transcript:", ...lines.map((line) => `  > ${line}`)];
}

function renderBullet(m: NormalizedMessage): string {
  const { date, time } = formatLocalDateTime(m.timestamp);
  let body = (m.body ?? "").trim();
  const isAudio = m.media?.kind === "audio";
  if (isAudio && !body) body = "*[audio]*";
  else if (isAudio && body) body = `*[audio]* ${body}`;
  else if (m.hasMedia && !body) body = "*[media]*";
  else if (m.hasMedia && body) body = `*[media]* ${body}`;

  const bodyLines = body.split("\n");
  const [firstLine, ...restLines] = bodyLines;

  const parts: string[] = [];
  parts.push(`- **${date} ${time}** -- ${m.sender.name}: ${firstLine ?? ""}`);

  if (m.media?.transcript) {
    parts.push(...renderTranscript(m.media.transcript));
  }

  if (m.replyTo?.body) {
    const who = m.replyTo.authorName ?? "earlier";
    parts.push(`  > ${who}: ${truncate(m.replyTo.body, REPLY_TRUNCATE)}`);
  }

  for (const line of restLines) {
    parts.push(`  ${line}`);
  }

  return parts.join("\n");
}

function renderChatSection(bundle: ChatBundle): string {
  const kind = bundle.isGroup ? "group" : "direct";
  const title = `## ${bundle.name ?? bundle.chatId.split("@")[0]} _(${kind})_`;

  const stats = [
    `${bundle.messageCount} messages`,
    `${bundle.inWindowCount} in window`,
    bundle.paddedWithOlder > 0 ? `${bundle.paddedWithOlder} older for context` : null,
    `chatId: \`${bundle.chatId}\``,
  ]
    .filter(Boolean)
    .join(" · ");

  const bullets = bundle.messages.map(renderBullet).join("\n");

  return [title, "", `*${stats}*`, "", bullets, ""].join("\n");
}

export interface RenderResult {
  path: string;
  chatCount: number;
  messageCount: number;
}

export function renderPull(output: FetchOutput): { markdown: string; filename: string } {
  const { config, fetchedAt, chats, skipped } = output;
  const pulledLocal = formatLocalDateTime(fetchedAt);
  const windowStartLocal = formatLocalDateTime(config.window.start);
  const windowEndLocal = formatLocalDateTime(config.window.end);

  const totalMessages = chats.reduce((s, c) => s + c.messageCount, 0);
  const paddedChats = chats.filter((c) => c.paddedWithOlder > 0).length;

  const front = [
    "---",
    "source: whatsapp-sync",
    `pulled_at: ${pulledLocal.iso}`,
    `window_start: ${windowStartLocal.iso}`,
    `window_end: ${windowEndLocal.iso}`,
    `window_days: ${config.window.days}`,
    `min_messages_per_chat: ${config.minMessagesPerChat}`,
    `chats: ${chats.length}`,
    `messages: ${totalMessages}`,
    `skipped_chats: ${skipped.length}`,
    `session: ${config.wahaSession}`,
    config.me?.id ? `me: ${config.me.id}` : null,
    "---",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const header = [
    `# WhatsApp Sync -- ${pulledLocal.date} ${pulledLocal.time}`,
    "",
    `Window: **${windowStartLocal.date} ${windowStartLocal.time}** -> **${windowEndLocal.date} ${windowEndLocal.time}** ` +
      `(${config.window.days}d) · ${chats.length} chats · ${totalMessages} messages` +
      (paddedChats > 0 ? ` · ${paddedChats} padded with older context` : ""),
    "",
  ].join("\n");

  const sections = chats.map(renderChatSection).join("\n");

  const footer = skipped.length
    ? [
        "",
        "---",
        "",
        "## Skipped chats",
        "",
        ...skipped.map((s) => `- \`${s.chatId}\`${s.name ? ` (${s.name})` : ""} -- ${s.reason}`),
        "",
      ].join("\n")
    : "";

  const filename = `${pulledLocal.date} ${pulledLocal.time.replace(":", "")}.md`;
  const markdown = `${front}${header}${sections}${footer}`;
  return { markdown, filename };
}

export function writePullToVault(output: FetchOutput): RenderResult {
  const { markdown, filename } = renderPull(output);
  const fullPath = join(output.config.vaultPath, output.config.subfolder, filename);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, markdown, "utf8");
  return {
    path: fullPath,
    chatCount: output.chats.length,
    messageCount: output.chats.reduce((s, c) => s + c.messageCount, 0),
  };
}
