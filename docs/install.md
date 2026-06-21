# Installation

Open Record/Replay runs locally on macOS. The CLI is the primary entry point.

## Requirements

- macOS.
- Node.js 18+.
- Swift toolchain / Xcode Command Line Tools.
- Accessibility permission for the native recorder.
- Input Monitoring permission may be required for keyboard capture.

## Install From Source

```bash
git clone <repo-url> open-record-replay
cd open-record-replay
npm install
npm run check
```

Build the native macOS recorder:

```bash
npm run build:native
```

Check recorder permissions before recording:

```bash
node bin/orr.js permissions check
```

If either permission is missing, ask macOS to open the relevant prompts:

```bash
node bin/orr.js permissions request
```

Then enable the requested entries in System Settings and run `permissions check` again.

Run a smoke test without starting the native recorder:

```bash
node bin/orr.js record start --name smoke --out .tmp-smoke --no-recorder
node bin/orr.js record stop latest --out .tmp-smoke
node bin/orr.js session validate-recording latest --out .tmp-smoke
```

The smoke test may fail the official recording contract because `--no-recorder` intentionally does not capture action-level events. It verifies CLI/session file wiring only.

## Local CLI Usage

From the repo:

```bash
node bin/orr.js permissions check
node bin/orr.js record start --name my-workflow --out runs
node bin/orr.js record stop latest --out runs
node bin/orr.js session validate-recording latest --out runs
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

If installed globally in the future, the same commands become:

```bash
orr permissions check
orr record start --name my-workflow --out runs
orr record stop latest --out runs
orr skill prepare latest --runs runs --out skill-inputs
```

## macOS Permissions

The native recorder relies on macOS Accessibility APIs and a CG event tap.

`record start` runs a native permission preflight by default. If Accessibility or Input Monitoring is missing, it refuses to start the recording because the resulting `events.jsonl` would be too shallow to use as skill evidence.

Grant permissions in System Settings:

- Privacy & Security -> Accessibility.
- Privacy & Security -> Input Monitoring.

Depending on how the recorder is launched, macOS may ask for permission for Terminal, the host agent app, Node.js, or the built `orr-platform-macos` binary.

Use these commands as the first troubleshooting step:

```bash
node bin/orr.js permissions check
node bin/orr.js permissions request
```

If a recording has shallow events or missing keyboard/mouse activity, check these permissions first.

The core native recorder does not require Screen Recording. Screenshot-based or visual-evidence experiments may require Screen Recording, but screenshots are not the primary evidence stream.

## Output Locations

Default recording output:

```text
runs/sessions/<session-id>/
├── events.jsonl
├── orr_session.json
├── recording_manifest.json
├── session.json
└── screenshots/
```

Default skill evidence package:

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

`events.jsonl` is the primary evidence stream. Screenshots are auxiliary and are not used by the native recorder by default.
