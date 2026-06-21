# Public Release Checklist

Use this before making the repository public or cutting an alpha release.

## Repository Hygiene

- Confirm `node_modules/` is not committed.
- Confirm local recordings are not committed:
  - `runs/`
  - `skill-inputs/`
  - `.tmp*/`
- Confirm `.DS_Store` files are not committed.
- Confirm all committed fixtures are sanitized and intentionally public.
- Confirm `package-lock.json` is committed.

## Verification

Run:

```bash
npm ci
npm run check
```

On a real macOS desktop, also run:

```bash
node bin/orr.js permissions check
node bin/orr.js record start --name release-smoke --out runs
# perform a short workflow
node bin/orr.js record stop latest --out runs
node bin/orr.js session validate-recording latest --out runs
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

The recording contract should pass for a normal UI demonstration with real user actions.

## Documentation

- README explains the CLI-first path.
- Installation docs mention macOS, Node.js, Swift, Accessibility, and Input Monitoring.
- Privacy docs explain what `events.jsonl` can contain.
- Recording data contract documents the expected event stream.
- Public README presents the CLI-first path only.

## Release Positioning

The alpha release should be described as:

```text
macOS native recorder + CLI-first evidence package toolchain
```

It should not be described as:

- A Codex plugin.
- A deterministic UI macro replayer.
- A workflow interpreter.
- A final skill generator.

## Known Limitations

- macOS only.
- Requires user-granted Accessibility and Input Monitoring permissions.
- Event target precision can still be low for some Electron/WebView/deep browser UI surfaces.
- Raw recordings may contain sensitive local UI data.
- Final skill quality depends on the host agent's native skill creator.
