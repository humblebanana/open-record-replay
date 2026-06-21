import { copyFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureDir, getSession, readJson, writeJson } from "./store.mjs";

const README = `# Computer Use Skill Evidence Package

This package contains raw Record/Replay evidence for creating or refining a Computer Use automation skill through the current host agent's native skill creator.

The recording shows a user-demonstrated desktop workflow. Hand this package to the host agent's native skill creation mechanism so the final skill is written, installed, validated, and discovered in that agent's own supported format.

Do not treat this package as the final skill. Open Record/Replay only prepares evidence; it does not replace Codex skill-creator, Claude Code's native skill authoring flow, or any other host-specific skill creator.

## Files

- session.json: recording metadata and timing.
- events.jsonl: primary event stream evidence.

## Source-of-Truth Rules

- Treat events.jsonl as the source of truth.
- Do not infer actions that are not supported by events.
- Ask the user when a key action is ambiguous.
- Use the current host agent's native skill creator to create or refine the final skill.
- Do not manually write or install the final skill unless the host has no native skill creator and the user explicitly approves that fallback.
- Do not include sensitive information from recorded events in generated skills.

## Node Breakdown Requirements

When creating a skill, break the demonstrated workflow into explicit nodes. A node is one meaningful user-facing operation, not necessarily one raw event.

For each node, describe:

- Goal: what this node accomplishes.
- App/window: where the action happens.
- Evidence: relevant event ids or event kinds from events.jsonl.
- Action: the concrete Computer Use operation, such as click, type, press key, select, drag, paste, or wait.
- Target: the UI element or stable text/AX target to use when available.
- Verification: how the agent should know the node succeeded.
- Fallback: what to do if the target is missing or ambiguous.

Prefer detailed, step-by-step Computer Use instructions over vague summaries. If an action is represented only by a generic target such as AXGroup, AXScrollArea, or a low-confidence action cluster, explain the safer verification or ask the user instead of pretending the target is certain.

## Skill Writing Guidance

- Parameterize reusable inputs such as recipient, file path, URL, search query, target item, or message text.
- Preserve the workflow shape, not one-off recorded values.
- Include verification steps after side-effect actions such as send, upload, create, post, save, or publish.
- Avoid coordinate-only instructions unless there is no semantic target in events.jsonl.
- Prefer stable app names, window titles, AX roles, visible labels, selected items, and focused text fields from the event stream.
`;

export async function prepareSkillEvidencePackage({ sessionId = "latest", runs = "runs", out = "skill-inputs" } = {}) {
  const session = await getSession(sessionId, runs);
  const eventsPath = session.artifacts?.events_path;
  if (!eventsPath || !existsSync(eventsPath)) {
    throw new Error(`events.jsonl not found for session: ${session.id}`);
  }

  const packageDir = path.resolve(process.cwd(), out, session.id);
  await ensureDir(packageDir);

  const sourceSessionPath = path.join(path.dirname(eventsPath), "session.json");
  const targetSessionPath = path.join(packageDir, "session.json");
  const targetEventsPath = path.join(packageDir, "events.jsonl");
  const targetReadmePath = path.join(packageDir, "README.md");

  if (existsSync(sourceSessionPath)) {
    await copyFile(sourceSessionPath, targetSessionPath);
  } else {
    await writeJson(targetSessionPath, session);
  }
  await copyFile(eventsPath, targetEventsPath);
  await writeFile(targetReadmePath, README, "utf8");

  return {
    session_id: session.id,
    package_dir: packageDir,
    files: {
      session_json: targetSessionPath,
      events_jsonl: targetEventsPath,
      readme: targetReadmePath
    },
    source: {
      session_json: existsSync(sourceSessionPath) ? sourceSessionPath : null,
      events_jsonl: eventsPath
    },
    handoff: {
      next_step: "invoke_host_native_skill_creator",
      must_use_host_native_skill_creator: true,
      fallback_requires_user_approval: true,
      evidence_package_dir: packageDir,
      instruction: "Pass this package directory to the current host agent's native skill creator. Do not manually write or install the final skill unless the host has no native skill creator and the user explicitly approves that fallback."
    },
    session: await readJson(targetSessionPath)
  };
}
