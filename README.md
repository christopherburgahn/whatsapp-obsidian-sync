# whatsapp-obsidian-sync

Agent-driven snapshot sync between WhatsApp, via a [WAHA](https://waha.devlike.pro) HTTP API, and an [Obsidian](https://obsidian.md) vault. A coding agent such as Cursor, Claude Code, Codex, or VS Code Copilot pulls a rolling window of recent messages and writes one dated Markdown file per run.

No cloud sync service, no background daemon, no database, and no state file.

## Privacy first

This tool handles private WhatsApp data. A sync can write message bodies, sender names, phone numbers, chat IDs, quoted replies, and optional voice-note transcripts into your Obsidian vault.

- Keep `.env`, generated snapshots, and test vaults out of Git.
- Run WAHA locally or on infrastructure you control.
- Protect `WAHA_API_KEY` and `OPENAI_API_KEY` like any other secret.
- If `TRANSCRIBE_AUDIO=1`, voice-note audio is downloaded from WAHA and sent to OpenAI for transcription.
- Review generated Markdown before sharing, committing, or publishing it.

This project is not affiliated with WhatsApp, Meta, WAHA, Obsidian, or OpenAI.

## No service or warranty

This is open-source software you run yourself. The maintainer does not provide a hosted service, managed sync, support SLA, legal advice, compliance review, or guaranteed data recovery.

Use it at your own risk. Check that it fits your privacy, workplace, and legal requirements before syncing real chats, especially if the messages include other people's personal data.

## How it fits together

```text
+-------------+        +------------------+        +---------------------+
| WhatsApp    | <----> | WAHA HTTP API    | <----> | sync.ts             |
| phone       |  QR    | localhost or     | HTTP   | pulls 7d window,   |
+-------------+        | self-hosted      |        | min 5 msgs / chat  |
                       +------------------+        +----------+----------+
                                                              |
                                                              v
                                                    +---------------------+
                                                    | Obsidian vault      |
                                                    | WhatsApp/           |
                                                    | 2026-04-20 2130.md |
                                                    | 2026-04-21 0915.md |
                                                    +---------------------+
```

## One-time setup

1. **Have a WAHA server reachable.** Either run it locally with Docker, following the [WAHA quick start](https://waha.devlike.pro/docs/overview/quick-start/), or point to a hosted instance you control. Start the `default` session, scan the QR code, wait until the session shows `WORKING`, and note the API key.

2. **Install and configure this project.**

   ```bash
   npm install
   cp .env.example .env
   ```

   Edit `.env`:

   - `WAHA_BASE_URL`: for example `http://localhost:3000` or `https://waha.example.com`
   - `WAHA_API_KEY`: from your WAHA config
   - `OBSIDIAN_VAULT_PATH`: absolute path to your vault
   - Optional: `SYNC_SUBFOLDER`, `LOOKBACK_DAYS`, `MIN_MESSAGES_PER_CHAT`, `CHAT_DENYLIST`
   - Optional transcription: `TRANSCRIBE_AUDIO=1`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL`

3. **Let the agent do the rest.** Tell your agent: "Sync my WhatsApp to Obsidian."

   The agent follows `.agents/skills/whatsapp-obsidian-sync/SKILL.md`, an [Agent Skills](https://agentskills.io)-compatible package. It runs `npm run -s sync`, reports the file it wrote, and optionally enriches it with summaries, tags, or links if you ask.

## Behavior at a glance

- **Window:** last `LOOKBACK_DAYS` days, default 7. Chats with zero activity in the window are skipped.
- **Minimum context:** active chats with fewer than `MIN_MESSAGES_PER_CHAT` messages in the window, default 5, are padded with older messages for context.
- **One file per pull:** `<vault>/<SYNC_SUBFOLDER>/YYYY-MM-DD HHMM.md`.
- **Snapshot, not incremental:** there are no cursors or state files. Re-running is safe; successive files overlap.
- **Text by default:** media is only downloaded for optional voice-note transcription.

## Manual scripts

```bash
npm run -s sync       # pull + render, writes one .md file, prints result JSON
npm run -s fetch      # print normalized JSON without writing anything
npm run typecheck     # TypeScript sanity check
npm test              # build and run verification checks
```

## Repo layout

```text
.
|-- AGENTS.md
|-- .agents/skills/whatsapp-obsidian-sync/
|   |-- SKILL.md
|   |-- references/waha-api.md
|   `-- scripts/
|       |-- sync.ts
|       |-- fetch.ts
|       `-- lib/
|-- .env.example
|-- CONTRIBUTING.md
|-- SECURITY.md
`-- package.json
```

The source lives under `.agents/skills/` so Agent Skills-aware tools can discover the workflow and use the deterministic scripts without inventing their own WhatsApp or vault logic.

## Sample output

```markdown
---
source: whatsapp-sync
pulled_at: 2026-04-20T21:30:15+02:00
window_start: 2026-04-13T21:30:15+02:00
window_end: 2026-04-20T21:30:15+02:00
window_days: 7
min_messages_per_chat: 5
chats: 2
messages: 8
skipped_chats: 1
session: default
me: 15550000000@c.us
---

# WhatsApp Sync -- 2026-04-20 21:30

Window: **2026-04-13 21:30** -> **2026-04-20 21:30** (7d) - 2 chats - 8 messages

## Example Friend _(direct)_

*5 messages - 5 in window - chatId: `15550000001@c.us`*

- **2026-04-20 19:12** -- me: Are we still on for tonight?
- **2026-04-20 19:15** -- Example Friend: Yes, see you at 20:00.
```

## Troubleshooting

- **Missing env var:** copy `.env.example` to `.env` and fill in `WAHA_API_KEY` and `OBSIDIAN_VAULT_PATH`.
- **Session or auth error:** check that your WAHA session is `WORKING` and the API key matches your WAHA config.
- **No active chats:** increase `LOOKBACK_DAYS`, or confirm WAHA sees recent messages.
- **Unexpected chats:** use `CHAT_ALLOWLIST` or `CHAT_DENYLIST`.
- **Transcription skipped:** confirm `TRANSCRIBE_AUDIO=1`, `OPENAI_API_KEY` is set, and the media file is below the transcription size limit.

## Project status

This is an early, local-first utility. The current design intentionally favors simple snapshots over full sync state, conflict handling, or a background daemon.

## License

MIT
