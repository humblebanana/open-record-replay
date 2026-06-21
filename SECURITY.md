# Security Policy

Open Record/Replay captures local desktop activity. Treat recordings as sensitive by default.

## Sensitive Data

`events.jsonl` can contain:

- Window titles.
- URLs.
- Typed text.
- Selected text.
- File names and local paths.
- Accessibility tree text from apps and web pages.
- UI labels that may reveal account, document, project, or customer data.

Do not publish raw recordings unless you have reviewed and sanitized them.

## Supported Versions

This project is currently alpha. Security fixes target the current `main` branch.

## Reporting Issues

If you find a vulnerability or privacy issue, do not open a public issue with sensitive details. Contact the project maintainers privately, or open a minimal public issue that states the affected area without including raw recordings, secrets, screenshots, or private event streams.

## Safe Defaults

The project should preserve these defaults:

- Recordings are stored locally.
- `events.jsonl` remains the source of truth.
- Screenshots are auxiliary and optional, not required for the core recorder.
- Final skill creation is delegated to the host agent's native skill creator.
- Sensitive values should not be copied into generated skills.
