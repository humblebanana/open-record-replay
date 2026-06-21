# Contributing

Open Record/Replay is currently an alpha macOS recorder and CLI-first toolchain. Contributions should preserve the core contract:

```text
record -> session.json / events.jsonl -> skill evidence package -> host-native skill creator
```

## Development Setup

Requirements:

- macOS.
- Node.js 18+.
- Swift toolchain / Xcode Command Line Tools.

Install and verify:

```bash
npm install
npm run check
```

`npm run check` runs the Node test suite and builds the native macOS recorder.

## Recorder Changes

Recorder changes must keep `events.jsonl` as the primary evidence stream.

Do:

- Preserve action-level events such as `window.changed`, `mouse.click`, `mouse.drag`, `keyboard.text_input`, `keyboard.submit`, and `selection.changed`.
- Preserve AX full tree or AX diff evidence for meaningful UI changes.
- Add fixture or contract tests when changing event structure.
- Keep screenshot or visual evidence optional and auxiliary.

Do not:

- Add automatic workflow interpretation as a default artifact.
- Treat screenshots as official Record & Replay parity evidence.
- Add host-specific behavior to the core engine.
- Generate or install the final skill from Open Record/Replay itself.

## Tests

Run before submitting changes:

```bash
npm test
npm run build:native
```

For recorder-quality work, also compare a fresh recording against source-of-truth fixtures:

```bash
node bin/orr.js session validate-recording latest --out runs
node bin/orr.js quality sources
node bin/orr.js quality compare latest --source feishu-file-send --out runs
node bin/orr.js quality compare latest --source youtube-play-video --out runs
```

## Generated Data

Do not commit local recordings or generated packages:

- `runs/`
- `skill-inputs/`
- `.tmp*/`
- `packages/platform-macos/.build/`

If a fixture is needed, use a deliberately small, sanitized recording and document why it is safe to include.

## Pull Requests

In a PR description, include:

- What changed.
- Which event contract or user flow it affects.
- Commands used to test.
- Any known privacy, permission, or compatibility implications.
