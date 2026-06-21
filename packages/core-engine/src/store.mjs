import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

export const DEFAULT_QUERY = "study jazz music";
const execFileAsync = promisify(execFile);

export function resolveRunRoot(out = "runs") {
  return path.resolve(process.cwd(), out);
}

export function sessionDir(runRoot, sessionId) {
  return path.join(runRoot, "sessions", sessionId);
}

export function sessionMetadataPath(dir) {
  return path.join(dir, "session.json");
}

export function sessionStatePath(dir) {
  return path.join(dir, "orr_session.json");
}

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function appendEvent(eventsPath, event) {
  await ensureDir(path.dirname(eventsPath));
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`, "utf8");
}

export async function readEvents(eventsPath) {
  const raw = await readFile(eventsPath, "utf8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function createSession({
  name = "screen-activity",
  out = "runs",
  recorder = true,
  recorderKind = "native-macos",
  preflight = true,
  requestPermissions = false
} = {}) {
  if (recorder && recorderKind === "native-macos" && preflight) {
    const permissions = await checkNativeMacOSPermissions({ request: requestPermissions });
    if (!permissions.recorderReady) throw new RecorderPermissionError(permissions);
  }

  const runRoot = resolveRunRoot(out);
  const id = randomUUID().toUpperCase();
  const dir = sessionDir(runRoot, id);
  const eventsPath = path.join(dir, "events.jsonl");
  const screenshotsDir = path.join(dir, "screenshots");
  const recordingManifestPath = path.join(dir, "recording_manifest.json");
  const startedAt = new Date().toISOString();
  const metadata = {
    endedAt: null,
    endReason: null,
    eventsPath,
    id,
    startedAt
  };
  const session = {
    schema_version: 1,
    kind: "session",
    id,
    startedAt,
    endedAt: null,
    endReason: null,
    eventsPath,
    name,
    status: "recording",
    started_at: startedAt,
    ended_at: null,
    end_reason: null,
    platform: {
      os: "macos",
      arch: process.arch
    },
    demo: recorderKind === "chrome-youtube" || name === "youtube-play-music" ? {
      kind: "youtube-play-music",
      default_query: DEFAULT_QUERY,
      browser: "Google Chrome",
      requires_login: false
    } : null,
    artifacts: {
      events_path: eventsPath,
      screenshots_dir: screenshotsDir,
      recording_manifest_path: recordingManifestPath,
      workflow_path: null,
      replay_trace_path: null
    },
    recorder: null
  };
  await writeJson(sessionMetadataPath(dir), metadata);
  await writeJson(sessionStatePath(dir), session);
  await appendEvent(eventsPath, {
    id: 1,
    kind: "session.started",
    timestamp: startedAt
  });
  if (!recorder) return session;

  const invocation = await recorderInvocation({
    recorderKind,
    sessionState: sessionStatePath(dir),
    eventsPath,
    screenshotsDir,
    manifestPath: recordingManifestPath
  });

  const recorderProcess = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore"
  });
  recorderProcess.unref();

  const updated = {
    ...session,
    recorder: {
      kind: invocation.kind,
      pid: recorderProcess.pid,
      started_at: new Date().toISOString()
    }
  };
  await writeJson(sessionStatePath(dir), updated);
  return updated;
}

export class RecorderPermissionError extends Error {
  constructor(permissions) {
    super([
      "Native macOS recorder permissions are not ready.",
      `Missing: ${permissions.missing?.length ? permissions.missing.join(", ") : "unknown"}.`,
      "Run `node bin/orr.js permissions request` and enable the requested macOS permissions, then retry recording."
    ].join("\n"));
    this.name = "RecorderPermissionError";
    this.permissions = permissions;
  }
}

export async function checkNativeMacOSPermissions({ request = false } = {}) {
  const binary = await buildNativeMacOSRecorder();
  const { stdout } = await execFileAsync(binary, [request ? "permissions-request" : "permissions-check"], { timeout: 120000 });
  return JSON.parse(stdout);
}

export async function stopSession({ sessionId = "latest", out = "runs" } = {}) {
  const session = await getSession(sessionId, out);
  const dir = path.dirname(session.artifacts.events_path);
  if (session.recorder?.pid) {
    try {
      process.kill(session.recorder.pid, "SIGTERM");
    } catch {
      // The recorder may already have exited. The session can still be closed.
    }
    await waitForProcessExit(session.recorder.pid, 15000);
  }
  const events = await readEvents(session.artifacts.events_path);
  const existingEndedEvent = [...events].reverse().find((event) => event.kind === "session.ended");
  const latestState = existsSync(sessionStatePath(dir)) ? await readJson(sessionStatePath(dir)) : session;
  const endedAt = existingEndedEvent?.timestamp ?? new Date().toISOString();
  const endReason = latestState.endReason ?? latestState.end_reason ?? "recording_controls_stopped";
  const status = latestState.status === "cancelled" ? "cancelled" : "completed";
  const updated = {
    ...latestState,
    status,
    ended_at: endedAt,
    endedAt,
    end_reason: endReason,
    endReason,
    recorder: latestState.recorder ? { ...latestState.recorder, stopped_at: latestState.recorder.stopped_at ?? endedAt } : null
  };
  let finalEventCount = events.length;
  if (!existingEndedEvent) {
    await appendEvent(session.artifacts.events_path, {
      id: events.length + 1,
      kind: "session.ended",
      timestamp: endedAt
    });
    finalEventCount += 1;
  }
  await finalizeRecordingManifest(session, endedAt, finalEventCount);
  await writeJson(sessionMetadataPath(dir), {
    endedAt,
    endReason,
    eventsPath: session.artifacts.events_path,
    id: session.id,
    startedAt: session.startedAt ?? session.started_at
  });
  await writeJson(sessionStatePath(dir), updated);
  return updated;
}

async function finalizeRecordingManifest(session, endedAt, finalEventCount) {
  const manifestPath = session.artifacts?.recording_manifest_path;
  if (!manifestPath || !existsSync(manifestPath)) return;
  const manifest = await readJson(manifestPath);
  await writeJson(manifestPath, {
    ...manifest,
    event_count: finalEventCount,
    ended_at: endedAt,
    includes_session_ended: true
  });
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch {
      return;
    }
  }
}

export async function listSessions(out = "runs") {
  const root = path.join(resolveRunRoot(out), "sessions");
  if (!existsSync(root)) return [];
  const entries = await readdir(root);
  const sessions = [];
  for (const entry of entries) {
    const dir = path.join(root, entry);
    const file = existsSync(sessionStatePath(dir)) ? sessionStatePath(dir) : sessionMetadataPath(dir);
    if (!existsSync(file)) continue;
    const metadata = await stat(file);
    sessions.push({ ...normalizeSession(await readJson(file)), metadata_mtime_ms: metadata.mtimeMs });
  }
  return sessions.sort((a, b) => b.metadata_mtime_ms - a.metadata_mtime_ms);
}

export async function getSession(sessionId = "latest", out = "runs") {
  if (sessionId === "latest") {
    const sessions = await listSessions(out);
    if (!sessions.length) throw new Error("No sessions found.");
    return sessions[0];
  }
  const dir = path.join(resolveRunRoot(out), "sessions", sessionId);
  const file = existsSync(sessionStatePath(dir)) ? sessionStatePath(dir) : sessionMetadataPath(dir);
  if (!existsSync(file)) throw new Error(`Session not found: ${sessionId}`);
  return normalizeSession(await readJson(file));
}

export function workflowPathFor(out, name = "youtube-play-music") {
  return path.resolve(process.cwd(), out, `${name}.workflow.json`);
}

async function recorderInvocation({ recorderKind, sessionState, eventsPath, screenshotsDir, manifestPath }) {
  if (recorderKind === "native-macos") {
    const binary = await buildNativeMacOSRecorder();
    return {
      kind: "native-macos-recorder",
      command: binary,
      args: ["record", "--session", sessionState, "--events", eventsPath, "--manifest", manifestPath]
    };
  }
  if (recorderKind === "chrome-youtube") {
    return {
      kind: "chrome-youtube-poller",
      command: process.execPath,
      args: [
        path.resolve(process.cwd(), "packages/recorder/src/chromeYoutubeRecorder.mjs"),
        "--session",
        sessionState,
        "--events",
        eventsPath
      ]
    };
  }
  if (recorderKind === "screen") {
    return {
      kind: "screen-activity-poller",
      command: process.execPath,
      args: [
        path.resolve(process.cwd(), "packages/recorder/src/screenActivityRecorder.mjs"),
        "--session",
        sessionState,
        "--events",
        eventsPath,
        "--screenshots",
        screenshotsDir
      ]
    };
  }
  throw new Error(`Unsupported recorder kind: ${recorderKind}`);
}

async function buildNativeMacOSRecorder() {
  const packagePath = path.resolve(process.cwd(), "packages/platform-macos");
  await execFileAsync("swift", ["build", "--package-path", packagePath], { timeout: 120000 });
  const { stdout } = await execFileAsync("swift", ["build", "--package-path", packagePath, "--show-bin-path"], { timeout: 120000 });
  return path.join(stdout.trim(), "orr-platform-macos");
}

function normalizeSession(session) {
  if (session.artifacts?.events_path) return session;
  if (!session.eventsPath) return session;
  return {
    schema_version: 1,
    kind: "session",
    id: session.id,
    startedAt: session.startedAt,
    endedAt: session.endedAt ?? null,
    endReason: session.endReason ?? null,
    eventsPath: session.eventsPath,
    name: session.name ?? "imported-recording",
    status: session.endedAt ? "completed" : "recording",
    started_at: session.startedAt,
    ended_at: session.endedAt ?? null,
    end_reason: session.endReason ?? null,
    platform: { os: "macos", arch: process.arch },
    demo: null,
    artifacts: {
      events_path: session.eventsPath,
      screenshots_dir: null,
      recording_manifest_path: null,
      workflow_path: null,
      replay_trace_path: null
    },
    recorder: null
  };
}
