# Security Policy

## Sensitive data

This project can process WhatsApp message bodies, sender names, phone numbers, chat IDs, quoted replies, media metadata, and optional voice-note transcripts.

This repository provides self-hosted software only. It is not a managed service, legal/compliance product, backup system, or promise that syncing WhatsApp data is appropriate for your situation. You are responsible for deciding whether your use is allowed and for protecting the data you export.

Never commit:

- `.env` or any file containing API keys
- generated WhatsApp snapshots
- downloaded media
- real Obsidian vault contents
- real chat IDs, phone numbers, or message excerpts used as fixtures

If a secret or private snapshot is accidentally committed, rotate the affected keys and remove the data from Git history before making the repository public.

## WAHA exposure

Run WAHA locally when possible. If WAHA is reachable over a network, protect it with a strong API key, HTTPS, and network access controls. Anyone with WAHA access may be able to read or download private WhatsApp data.

## Voice-note transcription

When `TRANSCRIBE_AUDIO=1`, this project downloads voice-note audio from WAHA and sends it to OpenAI's transcription API. Keep this disabled unless you are comfortable with that data flow.

## Reporting vulnerabilities

Please do not open a public issue for a vulnerability that exposes private data or credentials. Instead, contact the maintainer privately with:

- a short description of the issue
- affected versions or commits, if known
- reproduction steps
- the likely impact
