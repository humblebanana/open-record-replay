# Open Record/Replay

Show an agent a Mac workflow once. Keep the evidence. Let the agent turn it into a reusable skill.

Open Record/Replay is a local-first macOS recorder for workflows that are easier to demonstrate than to describe. It records a user's desktop actions into structured Record & Replay-style artifacts, then packages those artifacts for the current agent's native Skill Creator.

```text
demonstrate a workflow
-> record session.json + events.jsonl
-> prepare a skill evidence package
-> hand it to the host agent's native Skill Creator
-> create a reusable Computer Use skill
```

Use it when a workflow is easier to show than to explain, and you want the host agent to turn that demonstration into a reliable Computer Use skill.

For agents, this repo includes a host instruction skill at [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md). That skill tells the agent when to start recording, when to stop, how to inspect `events.jsonl`, and when to invoke the host's native Skill Creator.

## 中文

Open Record/Replay 让你把一个 Mac 上的真实操作流程演示一遍，然后把这次演示保存成 Agent 可以学习的结构化证据包。

它适合这些场景：

- 一个流程经常重复。
- 这个流程依赖你的个人偏好、账号环境、App 布局或团队习惯。
- 用文字很难说清楚，但你可以很快演示一遍。
- 你希望 Codex、Claude Code 或其他 Agent 后续能学会这个流程。

录制完成后，你可以把证据包交给当前使用的 Agent，让它用自己的 Skill 创建流程生成可复用的 Skill。

## What This Is

Open Record/Replay is:

- A macOS native workflow recorder.
- A CLI-first toolchain.
- A way to produce `session.json` and `events.jsonl` evidence.
- A bridge from user demonstration to host-native skill creation.

It is useful when you want an agent to learn a desktop workflow such as:

- Uploading files through a desktop app.
- Creating a document and sharing its link.
- Searching a site and starting the right media.
- Repeating a browser or Electron-app workflow that is hard to express as a prompt.

## What This Is Not

Open Record/Replay is not:

- A coordinate macro recorder.
- A screenshot-first recorder.
- A final skill generator.
- A cloud service.
- A generic desktop replay engine.

The primary evidence is always `events.jsonl`.

## How It Works

1. Start a recording from the CLI.
2. The user manually demonstrates the workflow.
3. Open Record/Replay writes a session directory.
4. Validate that the event stream contains useful action-level evidence.
5. Prepare a skill evidence package.
6. Give that package to the current agent's native Skill Creator.

The recording captures events such as:

- `window.changed`
- `mouse.click`
- `mouse.drag`
- `keyboard.text_input`
- `keyboard.submit`
- `selection.changed`

Events can include app/window attribution, UI targets, selected items, typed text, and Accessibility tree or diff evidence.

## Requirements

- macOS.
- Node.js 18+.
- Swift toolchain / Xcode Command Line Tools.
- Accessibility permission.
- Input Monitoring permission.

The core recorder does not require Screen Recording.

## Install

```bash
git clone <repo-url> open-record-replay
cd open-record-replay
npm install
npm run check
```

`npm run check` runs the Node test suite and builds the native macOS recorder.

## Quick Start

Check permissions:

```bash
node bin/orr.js permissions check
```

If permissions are missing:

```bash
node bin/orr.js permissions request
```

Start recording:

```bash
node bin/orr.js record start --name my-workflow --out runs
```

Demonstrate the workflow on your Mac.

Stop recording:

```bash
node bin/orr.js record stop latest --out runs
```

Validate the recording:

```bash
node bin/orr.js session validate-recording latest --out runs
```

Prepare the skill evidence package:

```bash
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

The package is written to:

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

Give this directory to the host agent's native Skill Creator.

## 中文快速开始

检查权限：

```bash
node bin/orr.js permissions check
```

如果缺少权限：

```bash
node bin/orr.js permissions request
```

开始录制：

```bash
node bin/orr.js record start --name my-workflow --out runs
```

在 Mac 上手动演示你想让 Agent 学会的流程。

停止录制：

```bash
node bin/orr.js record stop latest --out runs
```

验证录制质量：

```bash
node bin/orr.js session validate-recording latest --out runs
```

打包成 Skill Creator 输入：

```bash
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

然后把 `skill-inputs/<session-id>/` 交给当前 Agent 的原生 Skill Creator。

## CLI Reference

```bash
node bin/orr.js permissions check
node bin/orr.js permissions request
node bin/orr.js record start --name my-workflow --out runs
node bin/orr.js record stop latest --out runs
node bin/orr.js session list --out runs
node bin/orr.js session inspect latest --out runs
node bin/orr.js session events latest --out runs
node bin/orr.js session validate-recording latest --out runs
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

## Artifacts

Recording output:

```text
runs/sessions/<session-id>/
├── session.json
├── events.jsonl
├── orr_session.json
└── recording_manifest.json
```

Skill evidence package:

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

`session.json` records the session boundary and event path. `events.jsonl` is the primary evidence stream.

## Skill Creator Handoff

The evidence package is intentionally not the final skill.

The host agent should:

- Follow [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md) or equivalent host instructions.
- Read `README.md`.
- Inspect `events.jsonl`.
- Identify the demonstrated workflow.
- Ask the user when a key action is ambiguous.
- Invoke its own native Skill Creator.
- Install and validate the resulting skill in that host.

Examples:

- In Codex, use Codex `skill-creator`.
- In Claude Code, use Claude Code's native skill authoring/install flow.
- In another agent, use that agent's own skill mechanism.

## Privacy

Recordings are local by default, but they can contain sensitive data.

`events.jsonl` may include:

- Window titles.
- URLs.
- Typed text.
- Selected text.
- File names.
- Local paths.
- Accessibility tree text from apps and web pages.

Review recordings before sharing them. Do not publish raw recordings that contain secrets, private documents, customer data, internal URLs, or personal information.

See [Privacy](./docs/privacy.md).

## Status

This project is alpha software.

The current public shape is intentionally small:

```text
macOS native recorder
+ CLI
+ session.json / events.jsonl
+ skill evidence package
+ host-native Skill Creator handoff
```

Future layers may include richer adapters, visual evidence, inspector UI, or replay experiments, but they are not part of the core public path.

## Documentation

- [Installation](./docs/install.md)
- [Agent Usage](./docs/agent-integration.md)
- [Recording Data Contract](./docs/recording-data-contract.md)
- [Privacy](./docs/privacy.md)
- [Release Checklist](./docs/release-checklist.md)
- [Contributing](./CONTRIBUTING.md)
