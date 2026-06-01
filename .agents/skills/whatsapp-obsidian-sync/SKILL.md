---
name: whatsapp-obsidian-sync
description: Pulls a rolling window of WhatsApp chats from a WAHA HTTP API server and writes a single dated snapshot Markdown file into an Obsidian vault. Use when the user asks to sync WhatsApp to Obsidian, pull recent WhatsApp messages, generate a WhatsApp snapshot, update the WAHA notes, or produce a weekly WhatsApp digest.
license: MIT
---

# whatsapp-obsidian-sync

Pull the last N days of activity from every chat on a [WAHA](https://waha.devlike.pro) server and write it to a **single timestamped Markdown file** in an Obsidian vault. Deterministic rendering happens in `scripts/`; the agent's optional job is to enhance the generated file with tags, summaries, or cross-links.

## When to use

- "Sync my WhatsApp to Obsidian"
- "Give me this week's WhatsApp digest"
- "Pull the latest WhatsApp snapshot"
- "Update my WhatsApp notes"

## Mental model

- **Snapshot, not incremental.** Each run produces one self-contained file covering `LOOKBACK_DAYS` (default 7) for every active chat. Successive runs produce new files; overlap is expected.
- **No state between runs.** There is no cursor, no commit step. Re-running is safe and idempotent at file level (timestamped filenames).
- **Minimum 5 messages per chat** for context. If a chat has 1–4 messages in the window, older messages are pulled to pad up to 5. Chats with zero messages in the window are skipped.
- **One file per pull**, all chats inside. Direct and group chats share the same file, separated by `## <chat name> _(direct|group)_` headings.

## Prerequisites

1. `.env` at the repo root with `WAHA_API_KEY` and `OBSIDIAN_VAULT_PATH`. If missing, tell the user to `cp .env.example .env` and fill it in.
2. `node_modules/` at the repo root. If not, run `npm install` once.
3. A WAHA session in `WORKING` state. If `sync` returns an auth or session error, surface it - do not retry.

Optional voice-note transcription:

- Set `TRANSCRIBE_AUDIO=1` and `OPENAI_API_KEY=<key>` to transcribe WhatsApp voice notes inline.
- `OPENAI_TRANSCRIBE_MODEL` defaults to `gpt-4o-transcribe`.
- If the key is missing or transcription fails, keep the normal snapshot and render the media placeholder instead of aborting.

## Primary workflow

```
- [ ] Step 1: Run the deterministic sync
- [ ] Step 2: (Optional) Post-process the generated file
- [ ] Step 3: Report summary
```

### Step 1: Deterministic sync (required)

```bash
npm run -s sync
```

This fetches messages and writes one Markdown file to `<OBSIDIAN_VAULT_PATH>/<SYNC_SUBFOLDER>/YYYY-MM-DD HHMM.md`. On success, the script prints JSON to stdout:

```json
{ "path": "/abs/path/WhatsApp/2026-04-20 2130.md", "chatCount": 17, "messageCount": 168, "windowDays": 7, "minMessagesPerChat": 5, "skipped": 1 }
```

If `chatCount` is 0, report "No active chats in the last N days" and stop.

### Step 2: Optional post-processing

The file is already usable as-is. Post-processing is only warranted when the user asks for it or when enrichment is obviously useful (e.g., "also tag family chats", "add a TL;DR at the top"). If the user didn't ask, skip this step.

Voice-note transcription happens during the sync itself, not as post-processing.

If enriching:

1. Read the file at the `path` returned in Step 1.
2. Preserve the existing frontmatter and chat sections — extend them, don't rewrite.
3. Typical enrichments:
   - Append a `## Summary` block at the top (below `# WhatsApp Sync — …`) with 3–5 bullet points of notable items across chats.
   - Add Obsidian `#tags` under each chat heading.
   - Add `[[links]]` to existing vault notes where appropriate (you may need to look around the vault first).
4. Write the file back.

### Step 3: Report

Tell the user:

- The path that was written.
- Chat count, message count, skipped count.
- Any post-processing performed (or note that you skipped it).

## File shape (for reference)

```markdown
---
source: whatsapp-sync
pulled_at: 2026-04-20T21:30:15+02:00
window_start: 2026-04-13T21:30:15+02:00
window_end: 2026-04-20T21:30:15+02:00
window_days: 7
min_messages_per_chat: 5
chats: 17
messages: 168
skipped_chats: 1
session: default
me: 15550000000@c.us
---

# WhatsApp Sync — 2026-04-20 21:30

Window: **2026-04-13 21:30** → **2026-04-20 21:30** (7d) · 17 chats · 168 messages · 2 padded with older context

## Example Friend _(direct)_

*5 messages · 5 in window · chatId: `15550000001@c.us`*

- **2026-04-20 19:12** — me: Are we still on for tonight?
- **2026-04-20 19:15** — Example Friend: Yes, see you at 20:00.

## Example Group _(group)_

*8 messages · 8 in window · chatId: `example-group@g.us`*

- **2026-04-20 18:00** — Example Member: I will be there in 10 minutes.
  > Earlier Member: I need to skip today.

---

## Skipped chats

- `status@broadcast` — in CHAT_DENYLIST
```

## Escape hatches

- **Raw JSON for debugging or custom post-processing**: run `npm run -s fetch` instead of `sync` — it prints the normalized fetch output without writing a file.
- **Narrow to specific chats**: set `CHAT_ALLOWLIST=id1@c.us,id2@g.us` in `.env` and re-run.
- **Change window**: set `LOOKBACK_DAYS=14` or similar in `.env`. The min-message padding (`MIN_MESSAGES_PER_CHAT`) still applies.
- **Disable padding**: `MIN_MESSAGES_PER_CHAT=0`.
- **Auth / session errors**: surface them as-is.

## Additional context

See [references/waha-api.md](references/waha-api.md) for WAHA endpoint shapes and edge cases.
