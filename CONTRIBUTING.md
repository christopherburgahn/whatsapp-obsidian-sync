# Contributing

Thanks for taking a look at `whatsapp-obsidian-sync`.

This project handles private messaging data, so small, boring, well-scoped changes are preferred. Please avoid adding generated snapshots, real chat IDs, phone numbers, media files, `.env` files, or vault contents to commits.

## Development setup

```bash
npm install
npm run typecheck
npm test
```

Useful commands:

```bash
npm run -s fetch      # prints normalized JSON, requires a configured WAHA server
npm run -s sync       # writes one Markdown snapshot to the configured vault
npm run build         # compiles TypeScript into dist/
```

## Before opening a pull request

- Run `npm run typecheck`.
- Run `npm test`.
- Keep examples fake and obviously non-personal.
- Update `README.md` or `.env.example` when changing user-facing config or behavior.
- Add tests or verification coverage for behavior changes.

## Design principles

- Local-first: users control their WAHA server, vault, and generated files.
- Snapshot-based: each run writes a standalone Markdown file.
- Agent-friendly: deterministic scripts do I/O; agents may optionally enrich output when asked.
- Privacy-aware: default behavior avoids media downloads and ignores generated private data.
