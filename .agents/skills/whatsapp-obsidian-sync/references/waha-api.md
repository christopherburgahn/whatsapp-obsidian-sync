# whatsapp-obsidian-sync reference

## WAHA endpoints used

All calls include header `X-Api-Key: <WAHA_API_KEY>`. Base URL comes from `WAHA_BASE_URL` (no trailing slash).

### Session

```
GET /api/sessions/{session}
```

Returns `{ name, status, me: { id, pushName, lid? } }`. Used to detect `me` so we can label outgoing messages as `"me"` and resolve self-replies in groups.

### Chats overview

```
GET /api/{session}/chats/overview?limit=100&offset=0
```

Returns an array of `{ id, name, picture, lastMessage }`. `lastMessage.timestamp` is unix seconds. We skip any chat whose `lastMessage.timestamp` is older than `now - LOOKBACK_DAYS*86400` — no activity in the window means no entry in the snapshot.

### Messages in window

```
GET /api/{session}/chats/{chatId}/messages?limit=200&downloadMedia=false&filter.timestamp.gte=<unix_seconds>
```

Returns an array of messages sorted by the engine; we re-sort ascending by `timestamp`. Typical fields:

- `id`, `timestamp`, `from`, `fromMe`, `body`, `hasMedia`, `ack`, `ackName`, `replyTo`, `participant`
- Engine-specific extras under `_data` (e.g. `_data.Info.PushName`, `_data.Info.Sender`, `_data.Info.SenderAlt`). These are used by `scripts/lib/sender.ts` to build a clean `sender` object and then stripped from the normalized output.

The default sync path passes `downloadMedia=false`. Optional voice-note transcription uses the single-message endpoint with `downloadMedia=true` for messages that already report `hasMedia=true`.

### Single message with media

```
GET /api/{session}/chats/{chatId}/messages/{messageId}?downloadMedia=true
```

Used when voice-note transcription is enabled. The full message payload includes a `media` object with fields such as `url`, `mimetype`, `filename`, and `error` when WAHA has downloaded the attachment.

### Last N messages (padding)

```
GET /api/{session}/chats/{chatId}/messages?limit=5&downloadMedia=false
```

Called only when a chat has fewer than `MIN_MESSAGES_PER_CHAT` messages in the window, to fetch older messages for context. The merged set is deduped by `id` and trimmed to the newest `MIN_MESSAGES_PER_CHAT`.

## Normalized message shape (what `fetch` emits)

```json
{
  "id": "false_15550000001@c.us_AAAA",
  "timestamp": 1776712869,
  "fromMe": false,
  "sender": { "name": "Example Friend", "phone": "15550000001", "id": "15550000001@c.us" },
  "inWindow": true,
  "body": "Hello",
  "hasMedia": false,
  "ack": 3,
  "ackName": "READ",
  "replyTo": {
    "id": "true_...",
    "participant": "1234567890@lid",
    "authorName": "Bob",
    "body": "Earlier thing Bob said",
    "hasMedia": false
  }
}
```

`replyTo.authorName` is resolved by scanning other messages in the same chat for a matching `sender.id`. If the quoted author is not visible in the current window, `authorName` is omitted and the renderer falls back to `> earlier: …`.

## ChatId format

- Direct: `<country-code><number>@c.us` (e.g. `15550000001@c.us`)
- Group: `<group-id>@g.us`
- Status broadcasts: `status@broadcast` — denylisted by default.

## Edge cases

- **Empty `name`**: rendering falls back to the numeric chatId prefix.
- **Group messages**: the sender is derived from `_data.Info.PushName` / `_data.Info.SenderAlt` / `participant`; `from` is the group chat id and must not be used as the sender.
- **Replies across window boundaries**: `replyTo.authorName` may be missing because the quoted message is older than the window — acceptable, the quote still renders.
- **Edited messages**: WAHA returns the latest edited form; we do not attempt to reconcile history.
- **Clock skew**: WAHA timestamps are authoritative.
- **Voice notes**: when transcription is enabled, the sync fetches the single-message media payload only for `hasMedia` messages, checks the `media.mimetype`, and transcribes `audio/*` files inline.

## Output file layout

```
<vaultPath>/
└── <syncSubfolder>/
    ├── 2026-04-20 2130.md
    ├── 2026-04-21 0915.md
    └── ...
```

One file per `sync` run. Filename is local time (`YYYY-MM-DD HHMM`). Overlap across runs is expected — dedupe is a user concern, not a tool concern.
