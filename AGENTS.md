# Agents guide

This repository is designed to be driven by a coding agent, not run as a long-lived daemon. The agent pulls a rolling window of WhatsApp messages from a [WAHA](https://waha.devlike.pro) server and turns them into one Obsidian snapshot Markdown file per run.

## Primary skill

Task-level instructions live in an [Agent Skills](https://agentskills.io)-compatible package:

```text
.agents/skills/whatsapp-obsidian-sync/
|-- SKILL.md
|-- references/waha-api.md
`-- scripts/
    |-- sync.ts
    |-- fetch.ts
    `-- lib/
```

Agent Skills-aware tools can auto-discover this from `.agents/skills/`. For tools that do not, read `SKILL.md` directly before starting any sync work.

## Deterministic tooling

Prefer these commands over making HTTP requests directly:

| Command | Purpose |
| --- | --- |
| `npm run -s sync` | Builds the scripts, pulls recent activity, renders one Markdown file inside the Obsidian vault, and prints JSON with the written path. |
| `npm run -s fetch` | Builds the scripts and prints the normalized JSON that `sync` would render. Use for debugging or custom post-processing. |

The commands compile TypeScript with `tsc` and run the built files from `dist/`.

## Snapshot model

- Each run produces one file; there is no cursor, no state file, and no commit step.
- Re-running overlaps with the previous snapshot by design.
- Chats with no activity in the configured window are skipped.
- Active chats with fewer than `MIN_MESSAGES_PER_CHAT` messages are padded with older messages for context.

## Privacy rules

- Never commit `.env`, generated WhatsApp snapshots, downloaded media, or test vault contents.
- Do not log or paste full message payloads unless the user explicitly asks for debugging detail.
- Do not download media unless using the optional voice-note transcription path.
- If `TRANSCRIBE_AUDIO=1`, make it clear that voice-note audio is sent to OpenAI for transcription.

## What the agent may do

- Optionally post-process the generated file with a summary block, tags, or cross-links when the user asks.
- Change config such as window length, allowlist, denylist, or minimum messages by editing `.env` when the user requests it.

## What the agent must not do

- Do not call WAHA endpoints not listed in `references/waha-api.md` without surfacing the intent to the user first.
- Do not rewrite or merge historical snapshot files during a new `sync` run.
- Do not add generated private data to this repository.
