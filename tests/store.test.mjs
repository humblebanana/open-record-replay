import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSession, readEvents, stopSession } from "../packages/core-engine/src/store.mjs";
import { prepareSkillEvidencePackage } from "../packages/core-engine/src/skillPackage.mjs";

test("record start/stop writes Codex-compatible session metadata and event stream", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "orr-store-test-"));
  try {
    const session = await createSession({ name: "compat-test", out, recorder: false });
    const stopped = await stopSession({ sessionId: session.id, out });
    const dir = path.dirname(stopped.artifacts.events_path);
    const metadata = JSON.parse(await readFile(path.join(dir, "session.json"), "utf8"));
    const events = await readEvents(stopped.artifacts.events_path);

    assert.deepEqual(Object.keys(metadata), ["endedAt", "endReason", "eventsPath", "id", "startedAt"]);
    assert.equal(metadata.id, session.id);
    assert.equal(metadata.eventsPath, stopped.artifacts.events_path);
    assert.equal(metadata.endReason, "recording_controls_stopped");
    assert.equal(events[0].kind, "session.started");
    assert.equal(events.at(-1).kind, "session.ended");
    assert.equal("session_id" in events[0], false);
    assert.equal("session_id" in events.at(-1), false);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("skill prepare creates a raw evidence package without interpretation", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "orr-skill-package-test-runs-"));
  const packageOut = await mkdtemp(path.join(tmpdir(), "orr-skill-package-test-out-"));
  try {
    const session = await createSession({ name: "skill-package-test", out, recorder: false });
    const stopped = await stopSession({ sessionId: session.id, out });
    const result = await prepareSkillEvidencePackage({ sessionId: stopped.id, runs: out, out: packageOut });

    assert.equal(result.session_id, stopped.id);
    assert.equal(result.handoff.next_step, "invoke_host_native_skill_creator");
    assert.equal(result.handoff.must_use_host_native_skill_creator, true);
    assert.equal(existsSync(result.files.session_json), true);
    assert.equal(existsSync(result.files.events_jsonl), true);
    assert.equal(existsSync(result.files.readme), true);

    const readme = await readFile(result.files.readme, "utf8");
    const packagedSession = JSON.parse(await readFile(result.files.session_json, "utf8"));
    const packagedEvents = await readFile(result.files.events_jsonl, "utf8");

    assert.equal(packagedSession.id, stopped.id);
    assert.match(packagedEvents, /"kind":"session.started"/);
    assert.match(packagedEvents, /"kind":"session.ended"/);
    assert.match(readme, /Treat events\.jsonl as the source of truth/);
    assert.match(readme, /Computer Use automation skill/);
    assert.match(readme, /host agent's native skill creator/);
    assert.match(readme, /Do not manually write or install the final skill/);
    assert.match(readme, /Node Breakdown Requirements/);
    assert.match(readme, /Goal: what this node accomplishes/);
    assert.match(readme, /Verification: how the agent should know the node succeeded/);
    assert.doesNotMatch(readme, /workflow demonstrated/i);
    assert.doesNotMatch(readme, /interpretation/i);
  } finally {
    await rm(out, { recursive: true, force: true });
    await rm(packageOut, { recursive: true, force: true });
  }
});
