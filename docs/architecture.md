# Architecture

Open Record/Replay is split into four layers.

## 1. Capture and Runtime

`packages/platform-macos` owns the primary native macOS recorder. It captures generic foreground activity with Accessibility and event-tap APIs, including app/window changes, AX tree/diff evidence, mouse events, keyboard events, drag gestures, and selection changes.

`packages/recorder` contains older and experimental TypeScript recorders, including screenshot/browser polling paths. These are not the default Open Record/Replay path.

The native macOS layer is intentionally separate from the TypeScript packages because stable low-level macOS capture requires native APIs.

## 2. Artifacts and Schema

`packages/schema` defines portable artifacts:

- `session.json`
- `events.jsonl`
- `orr_session.json`
- `recording_manifest.json`
- `screenshots/`
- `workflow.json`
- `replay_trace.json`

Raw events are kept as evidence. `events.jsonl` is the public source of truth.

The public artifact target is compatible with the observed Codex Record & Replay shape: `session.json` defines recording boundaries and paths using the five observed fields (`endedAt`, `endReason`, `eventsPath`, `id`, `startedAt`), while `events.jsonl` is the primary structured evidence stream. `orr_session.json` is internal state for this open-source engine and should not be treated as a host compatibility contract.

## 3. Skill Evidence Handoff

`packages/core-engine/src/skillPackage.mjs` turns a completed session into a skill evidence package:

- `README.md`
- `events.jsonl`
- `session.json`

The package is handed to the current host agent's native skill creator. Open Record/Replay does not write or install the final skill itself.

`packages/compiler`, `packages/locator`, `packages/privacy`, and `packages/replayer` are experimental workflow/replay components. They are not the main product path.

## 4. Host Integration

`packages/cli` is the primary integration surface. Any host agent that can run shell commands can use it.

`packages/mcp-server` exposes the same engine as optional stdio MCP tools for hosts that already support MCP. It should not be treated as required infrastructure.

Adapters under `adapters/` only configure host-specific connection and instructions.

The engine must not depend on Codex, Claude Code, or any single agent host.
