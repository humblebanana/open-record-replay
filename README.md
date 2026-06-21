# Open Record/Replay

Record a macOS workflow once. Package the evidence. Let an agent turn it into a reusable Computer Use skill.

English | [简体中文](#简体中文)

Open Record/Replay is a local-first recorder for desktop workflows that are easier to demonstrate than to describe. It captures a user's real macOS actions as structured Record & Replay-style artifacts, then prepares those artifacts so an agent can create a reusable skill from the demonstration.

```text
user demonstrates a workflow
-> Open Record/Replay records session.json + events.jsonl
-> Open Record/Replay validates and packages the evidence
-> the host agent reads the package
-> the host agent creates its own reusable Computer Use skill
```

Use it when the workflow depends on real desktop UI, app state, personal workspace layout, file pickers, browser pages, Electron apps, or other interactions that are hard to capture in a plain prompt.

## What It Can Do

Open Record/Replay can currently:

- Start and stop a local macOS recording session from the CLI.
- Capture action-level desktop evidence into `events.jsonl`.
- Save session metadata into `session.json`.
- Record app/window changes, clicks, drags, text input, submits, selections, and Accessibility tree or diff context.
- Validate whether a recording contains enough evidence to be useful.
- Package `events.jsonl` and `session.json` into a skill input directory.
- Provide agent instructions in [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md) so another agent knows how to run the recorder and inspect the result.

Typical workflows:

- Upload files or images through a desktop app.
- Create a document and share its link.
- Search a web app and start the right media.
- Repeat a browser or Electron-app process that depends on visible UI.
- Teach an agent a team-specific workflow by demonstration instead of writing a long prompt.

## What It Is Not

Open Record/Replay is not:

- A coordinate-only macro recorder.
- A screenshot-first recorder.
- A cloud recording service.
- A final skill generator.
- A replacement for an agent's native skill creation system.

The primary evidence is `events.jsonl`. Screenshots are not part of the current core recording path.

## How It Works

1. An agent or user runs the CLI to check macOS permissions.
2. The user starts a recording session.
3. The user manually demonstrates the workflow on their Mac.
4. The user stops the recording session.
5. Open Record/Replay writes a session directory under `runs/sessions/<session-id>/`.
6. The recording is validated against the expected event structure.
7. A skill input package is prepared under `skill-inputs/<session-id>/`.
8. The current agent reads that package and uses its own skill creation flow to produce the final skill.

The recorder captures events such as:

- `window.changed`
- `mouse.click`
- `mouse.drag`
- `keyboard.text_input`
- `keyboard.submit`
- `selection.changed`

Events may include app/window attribution, UI targets, selected items, typed text, and Accessibility tree or diff evidence.

## Requirements

- macOS.
- Node.js 18+.
- Swift toolchain / Xcode Command Line Tools.
- Accessibility permission.
- Input Monitoring permission.

The core recorder does not require Screen Recording.

## Install

```bash
git clone https://github.com/humblebanana/open-record-replay.git
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

Request missing permissions:

```bash
node bin/orr.js permissions request
```

Start recording:

```bash
node bin/orr.js record start --name my-workflow --out runs --request-permissions
```

Demonstrate the workflow on your Mac. When finished, stop the recording:

```bash
node bin/orr.js record stop latest
```

Validate the recording:

```bash
node bin/orr.js session validate-recording latest
```

Prepare the skill input package:

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

Give this directory to the current agent's skill creation flow.

## CLI Reference

```bash
node bin/orr.js permissions check
node bin/orr.js permissions request
node bin/orr.js record start --name my-workflow --out runs --request-permissions
node bin/orr.js record stop latest
node bin/orr.js session list
node bin/orr.js session inspect latest
node bin/orr.js session events latest
node bin/orr.js session validate-recording latest
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

The CLI also contains experimental workflow and demo commands. The stable public path is recording, validation, and skill input packaging.

## Artifacts

Recording output:

```text
runs/sessions/<session-id>/
├── session.json
├── events.jsonl
├── orr_session.json
└── recording_manifest.json
```

Skill input package:

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

`session.json` records the session boundary, timing, and event path. `events.jsonl` is the primary evidence stream.

## Agent Integration

Open Record/Replay is designed to be called by an agent, but it stays below the agent's skill layer.

The expected integration is:

1. The agent reads [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md).
2. The agent starts the recorder only when the user is ready.
3. The agent stops after recording starts and waits for the user to say the demonstration is complete.
4. The agent stops the recorder, validates the session, and packages the evidence.
5. The agent inspects `events.jsonl` as the source of truth.
6. The agent invokes its own native skill creation flow to create the final reusable skill.

This matters because different agents have different skill formats, install locations, trigger rules, and validation workflows. Open Record/Replay provides the evidence package; the host agent should create the final skill in its own native format.

## Privacy

Recordings are local by default, but `events.jsonl` can contain sensitive data:

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
+ recording validation
+ skill input package
+ host-agent skill creation handoff
```

Future layers may include richer adapters, visual evidence, an inspector UI, or replay experiments, but they are not part of the current stable public path.

## Documentation

- [Installation](./docs/install.md)
- [Agent Usage](./docs/agent-integration.md)
- [Recording Data Contract](./docs/recording-data-contract.md)
- [Privacy](./docs/privacy.md)
- [Release Checklist](./docs/release-checklist.md)
- [Contributing](./CONTRIBUTING.md)

---

# 简体中文

[English](#open-recordreplay) | 简体中文

Open Record/Replay 用来把一次真实的 macOS 操作流程录制成结构化证据包，再交给 Agent 生成可复用的 Computer Use Skill。

它解决的问题很直接：有些桌面工作流很难用文字讲清楚，但用户可以很快演示一遍。Open Record/Replay 负责把这次演示落盘成 `session.json` 和 `events.jsonl`，让 Agent 后续可以基于真实证据理解这个工作流。

```text
用户演示一个工作流
-> Open Record/Replay 录制 session.json + events.jsonl
-> Open Record/Replay 验证并打包证据
-> 当前 Agent 读取证据包
-> 当前 Agent 用自己的 Skill 创建流程生成最终 Skill
```

适合使用在这些场景：

- 工作流依赖真实桌面 UI。
- 工作流依赖 App 状态、窗口布局、账号环境或团队习惯。
- 工作流涉及文件选择器、浏览器页面、Electron App 或多 App 切换。
- 与其写一大段提示词，不如让用户直接演示一次。
- 希望 Codex、Claude Code 或其他有 Computer Use 能力的 Agent 学会一个重复流程。

## 它能做什么

Open Record/Replay 当前可以：

- 通过 CLI 启动和停止本地 macOS 录制。
- 把用户操作录制成 `events.jsonl`。
- 把录制边界和路径保存到 `session.json`。
- 捕捉窗口变化、点击、拖拽、文本输入、提交、选区变化，以及 Accessibility tree / diff 上下文。
- 检查录制结果是否包含足够的动作级证据。
- 把 `events.jsonl` 和 `session.json` 打包成 Skill 输入目录。
- 提供 [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md)，让其他 Agent 知道如何调用录制器、读取事件流、交给自己的 Skill 创建流程。

典型工作流：

- 在桌面 App 里上传文件或图片。
- 创建文档并分享链接。
- 在网页里搜索内容并播放指定媒体。
- 复现一个依赖浏览器或 Electron App 的操作流程。
- 通过演示让 Agent 学会一个团队内部流程。

## 它不是什么

Open Record/Replay 不是：

- 纯坐标宏录制器。
- 以截图为主的录制器。
- 云端录制服务。
- 最终 Skill 生成器。
- 某个 Agent 原生 Skill 系统的替代品。

当前核心证据是 `events.jsonl`。截图不是当前核心录制链路的一部分。

## 工作原理

1. 用户或 Agent 先检查 macOS 权限。
2. 用户开始录制。
3. 用户在 Mac 上手动演示目标工作流。
4. 用户结束录制。
5. Open Record/Replay 在 `runs/sessions/<session-id>/` 下写入录制产物。
6. 工具验证事件流是否符合预期数据结构。
7. 工具在 `skill-inputs/<session-id>/` 下准备 Skill 输入包。
8. 当前 Agent 读取这个输入包，并用自己的 Skill 创建流程生成最终 Skill。

录制器会捕捉这些事件：

- `window.changed`
- `mouse.click`
- `mouse.drag`
- `keyboard.text_input`
- `keyboard.submit`
- `selection.changed`

事件中可能包含 App / 窗口归属、UI target、选中文件或文本、输入内容，以及 Accessibility tree / diff 证据。

## 环境要求

- macOS。
- Node.js 18+。
- Swift toolchain / Xcode Command Line Tools。
- Accessibility 权限。
- Input Monitoring 权限。

核心录制器不需要 Screen Recording 权限。

## 安装

```bash
git clone https://github.com/humblebanana/open-record-replay.git
cd open-record-replay
npm install
npm run check
```

`npm run check` 会运行 Node 测试，并构建 macOS 原生录制器。

## 快速开始

检查权限：

```bash
node bin/orr.js permissions check
```

请求缺失权限：

```bash
node bin/orr.js permissions request
```

开始录制：

```bash
node bin/orr.js record start --name my-workflow --out runs --request-permissions
```

在 Mac 上演示你希望 Agent 学会的流程。完成后停止录制：

```bash
node bin/orr.js record stop latest
```

验证录制质量：

```bash
node bin/orr.js session validate-recording latest
```

准备 Skill 输入包：

```bash
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

产物会写入：

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

然后把这个目录交给当前 Agent 的 Skill 创建流程。

## CLI 命令

```bash
node bin/orr.js permissions check
node bin/orr.js permissions request
node bin/orr.js record start --name my-workflow --out runs --request-permissions
node bin/orr.js record stop latest
node bin/orr.js session list
node bin/orr.js session inspect latest
node bin/orr.js session events latest
node bin/orr.js session validate-recording latest
node bin/orr.js skill prepare latest --runs runs --out skill-inputs
```

CLI 里还保留了一些实验性的 workflow 和 demo 命令。当前稳定公开路径是：录制、验证、打包 Skill 输入。

## 产物

录制输出：

```text
runs/sessions/<session-id>/
├── session.json
├── events.jsonl
├── orr_session.json
└── recording_manifest.json
```

Skill 输入包：

```text
skill-inputs/<session-id>/
├── README.md
├── events.jsonl
└── session.json
```

`session.json` 记录录制边界、时间和事件路径。`events.jsonl` 是最关键的证据流。

## Agent 如何接入

Open Record/Replay 是给 Agent 调用的，但它本身位于 Skill 层之下。

推荐接入方式：

1. Agent 读取 [skills/open-record-replay/SKILL.md](./skills/open-record-replay/SKILL.md)。
2. Agent 只在用户准备好时开始录制。
3. 录制开始后，Agent 停止当前回合，等待用户演示完成。
4. 用户说完成后，Agent 停止录制、验证 session，并打包证据。
5. Agent 把 `events.jsonl` 当作 source of truth。
6. Agent 再调用自己的原生 Skill 创建流程，生成最终可复用 Skill。

这样设计是因为不同 Agent 的 Skill 格式、安装位置、触发规则和验证方式并不相同。Open Record/Replay 提供证据包；最终 Skill 应该由宿主 Agent 用自己的原生格式创建。

## 隐私

录制默认保存在本地，但 `events.jsonl` 可能包含敏感信息：

- 窗口标题。
- URL。
- 输入文本。
- 选中文本。
- 文件名。
- 本地路径。
- App 和网页里的 Accessibility tree 文本。

分享录制前必须先检查内容。不要公开包含密钥、私有文档、客户数据、内部 URL 或个人信息的原始录制。

详见 [Privacy](./docs/privacy.md)。

## 项目状态

这个项目目前是 alpha 版本。

当前公开形态有意保持很小：

```text
macOS 原生录制器
+ CLI
+ session.json / events.jsonl
+ 录制质量验证
+ Skill 输入包
+ 交给宿主 Agent 创建最终 Skill
```

未来可能会增加更丰富的适配器、视觉证据、Inspector UI 或 replay 实验，但这些不是当前稳定公开路径。

## 文档

- [安装说明](./docs/install.md)
- [Agent 使用说明](./docs/agent-integration.md)
- [录制数据契约](./docs/recording-data-contract.md)
- [隐私说明](./docs/privacy.md)
- [发布检查清单](./docs/release-checklist.md)
- [贡献指南](./CONTRIBUTING.md)
