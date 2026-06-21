# Privacy

Open Record/Replay is local-first, but its output can be sensitive.

## What Gets Written

The core recorder writes:

- `session.json`: recording boundary metadata.
- `events.jsonl`: one event per line. This is the primary evidence stream.
- `orr_session.json`: internal engine state.
- `recording_manifest.json`: artifact index and event count.

`events.jsonl` may contain UI-derived content, including:

- App names and bundle identifiers.
- Window titles.
- URLs.
- Typed text and submitted input.
- Selected text and selected file names.
- Accessibility tree text and diffs.
- Mouse, keyboard, drag, and selection targets.

## What Is Not Uploaded

Open Record/Replay does not upload recordings by default. Files are written to the local output directory, usually:

```text
runs/sessions/<session-id>/
```

The skill evidence package is also local:

```text
skill-inputs/<session-id>/
```

## Before Sharing

Before sharing a recording, review:

- `events.jsonl`
- `session.json`
- any optional screenshots or visual evidence if you enabled an experimental screenshot-based recorder

Remove or replace secrets, personal data, private document names, customer names, internal URLs, and local file paths.

## Skill Handoff

`orr skill prepare` copies raw evidence into a package for a host-native skill creator. The receiving agent should use the evidence to create reusable instructions, but it should not copy sensitive values into the final skill. Use placeholders for private values such as recipients, account names, tokens, file paths, and message content.

## Permission Scope

The native macOS recorder requires:

- Accessibility.
- Input Monitoring.

The core recorder does not require Screen Recording. Screenshot-based recorders or future visual evidence layers may require Screen Recording, but screenshots remain auxiliary evidence.
