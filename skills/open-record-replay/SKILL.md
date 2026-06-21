---
name: open-record-replay
description: Record a user-demonstrated macOS workflow with the Open Record/Replay CLI, inspect the captured event stream, prepare a skill evidence package, and hand it to the host agent's native skill creator. Use when the user asks the agent to watch them perform a task, record a workflow, or create/refine a reusable Computer Use skill from a demonstration.
---

# Open Record/Replay

Use this skill to learn a user-demonstrated macOS workflow through Open Record/Replay.

Open Record/Replay records evidence. It does not create the final skill by itself. After recording and packaging, invoke the current host agent's native Skill Creator or skill authoring flow.

## CLI Mapping

The OpenAI Record & Replay tool names map to this project's CLI flow:

```text
event_stream_start  -> node bin/orr.js record start
event_stream_stop   -> node bin/orr.js record stop
metadataPath        -> runs/sessions/<session-id>/session.json
eventsPath          -> runs/sessions/<session-id>/events.jsonl
skill handoff       -> node bin/orr.js skill prepare
```

Run commands from the Open Record/Replay repository root unless the user provides another path.

## Recording Workflow

1. Check permissions first:

```bash
node bin/orr.js permissions check
```

2. If permissions are missing, run:

```bash
node bin/orr.js permissions request
```

Tell the user which macOS permissions are missing and wait for them to enable the permissions before recording.

3. Start recording only when the user is ready:

```bash
node bin/orr.js record start --name my-workflow --out runs
```

4. After recording starts, do not poll or wait in a loop. End your turn and ask the user to perform the workflow and tell you when they are done.

5. When the user says they are done, stop the recording:

```bash
node bin/orr.js record stop latest --out runs
```

6. Validate the recording:

```bash
node bin/orr.js session validate-recording latest --out runs
```

7. Prepare a skill evidence package:

```bash
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

8. Confirm the package path and inspect the package files:

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

## If The User Cancels

If the user says they cancelled recording, do not continue to skill creation.

If needed, inspect `session.json` or `orr_session.json` to confirm cancellation, then acknowledge that no skill will be created from that recording.

## Interpreting Events

Treat `events.jsonl` as the primary evidence. `session.json` gives timing and file paths only.

When inspecting events, pay attention to:

- App and window attribution.
- `window.changed` events.
- `mouse.click` and `mouse.drag` targets.
- `keyboard.text_input` and `keyboard.submit` targets.
- `selection.changed`, selected text, and selected items.
- AX full-tree or diff payloads.

Do not infer unsupported actions from generic targets such as `AXGroup`, `AXScrollArea`, or low-confidence action clusters. If the workflow is unclear, ask the user what the intended action was.

## Creating Or Refining A Skill

If the recording contains enough evidence to identify a reusable workflow, create or refine a real discoverable skill by using the current host agent's native Skill Creator.

Do not stop at a summary, replay plan, or Markdown runbook unless the user explicitly asks for only that.

When creating the final skill:

- Treat the recording as evidence of the user's intended outcome, not a requirement to reproduce every raw event.
- Prefer stable app/window/control targets from the event stream.
- Include verification steps after side-effect actions such as send, upload, create, post, save, or publish.
- Parameterize reusable inputs such as recipient, file path, URL, search query, prompt, or message text.
- Avoid coordinate-only instructions unless no semantic target is available.
- Ask the user when a key action or destination is ambiguous.

## Privacy

Do not include sensitive values from recorded events in summaries or generated skills.

Treat the following as sensitive:

- Passwords.
- OTPs.
- API keys or tokens.
- SSNs, passports, financial account or card numbers.
- Private personal, medical, legal, HR, or customer data.
- Private local file paths or document names when not necessary for the workflow shape.

Use placeholders or generic descriptions when the skill needs to mention a sensitive value.
