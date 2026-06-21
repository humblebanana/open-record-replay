# Recording Data Contract

The public compatibility target is the observed Codex Record & Replay artifact shape:

- A session directory named by UUID.
- `session.json` with `id`, `startedAt`, `endedAt`, `endReason`, and `eventsPath`.
- `events.jsonl` as the primary evidence stream.

Screenshots are auxiliary evidence only. They must not be used to claim official Record & Replay parity.

## Required Event Strength

An official-parity recording must include action-level semantic events when the user performs those actions:

- `window.changed` with full AX tree or AX diff text, not only the window title.
- `mouse.click` with target role/title/description when available.
- `mouse.drag` for drag gestures.
- `keyboard.text_input` and `keyboard.submit` for typed text and submitted input.
- `selection.changed` with selected target and `selectedItems` for lists/file pickers when available.

For workflows like Feishu sending files, `events.jsonl` should be sufficient to identify the file picker, selected files, click/drag targets, and return to Feishu. Screenshot paths alone are not sufficient.

## Validation

Run:

```bash
orr session validate-recording <session-id> --out runs
```

The validator fails screenshot-first recordings that do not contain action-level semantic events or full-tree/diff-scale AX evidence.

## Source-Of-Truth Fixtures

The public repo includes sanitized data-quality fixtures:

- `fixtures/source-of-truth/feishu-file-send`: synthetic sample for sending files in a chat app.
- `fixtures/source-of-truth/youtube-play-video`: synthetic sample for searching YouTube and starting playback.

These fixtures preserve the expected event shape and semantic strength without including private user data. Do not judge quality from screenshots or aggregate event count alone; compare semantic evidence quality.

Baseline profile:

| Fixture | Events | AX chars | Mouse targets | Drag origin/destination | Selection events | Rich selected items | Keyboard target events | Screenshots |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `feishu-file-send` | 20 | 128,010 | 4 | 1 | 4 | 4 | 2 | 0 |
| `youtube-play-video` | 23 | 153,986 | 4 | 0 | 5 | 5 | 6 | 0 |

Use these commands during recorder work:

```bash
orr quality sources
orr quality compare <session-id> --source feishu-file-send --out runs
orr quality compare <session-id> --source youtube-play-video --out runs
orr quality compare --events /path/to/events.jsonl --source feishu-file-send
```

A candidate recording should be considered weak if it lacks the source event kinds, has shallow AX text, lacks mouse targets, lacks keyboard targets, lacks rich selected items, or uses screenshots as primary evidence.
