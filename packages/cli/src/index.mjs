import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  checkNativeMacOSPermissions,
  createSession,
  getSession,
  listSessions,
  readEvents,
  readJson,
  stopSession
} from "../../core-engine/src/store.mjs";
import { validateOfficialRecordingContract } from "../../core-engine/src/recordingContract.mjs";
import { compareRecordingToSource, listQualitySources } from "../../core-engine/src/recordingQuality.mjs";
import { prepareSkillEvidencePackage } from "../../core-engine/src/skillPackage.mjs";
import { compileWorkflow } from "../../compiler/src/youtubeWorkflow.mjs";
import { validateWorkflowWithWarnings } from "../../compiler/src/validateWorkflow.mjs";
import { replayWorkflow } from "../../replayer/src/index.mjs";
import { redactionPreview } from "../../privacy/src/index.mjs";

export async function main(argv) {
  const [area, command, ...rest] = argv;
  if (!area || area === "help" || area === "--help" || area === "-h") return printHelp();

  if (area === "permissions" && command === "check") return print(await permissionsCheck());
  if (area === "permissions" && command === "request") return print(await permissionsRequest());
  if (area === "record" && command === "start") return print(await recordStart(rest));
  if (area === "record" && command === "stop") return print(await recordStop(rest));
  if (area === "session" && command === "list") return print(await sessionList(rest));
  if (area === "session" && command === "inspect") return print(await sessionInspect(rest));
  if (area === "session" && command === "events") return print(await sessionEvents(rest));
  if (area === "session" && command === "validate-recording") return print(await sessionValidateRecording(rest));
  if (area === "workflow" && command === "compile") return print(await workflowCompile(rest));
  if (area === "workflow" && command === "validate") return print(await workflowValidate(rest));
  if (area === "workflow" && command === "replay") return print(await workflowReplay(rest));
  if (area === "redaction" && command === "preview") return print(await redaction(rest));
  if (area === "quality" && command === "sources") return print(await qualitySources(rest));
  if (area === "quality" && command === "compare") return print(await qualityCompare(rest));
  if (area === "skill" && command === "prepare") return print(await skillPrepare(rest));
  if (area === "demo" && command === "youtube") return print(await demoYouTube(rest));

  throw new Error(`Unknown command: ${argv.join(" ")}`);
}

async function recordStart(args) {
  const options = parseOptions(args);
  const session = await createSession({
    name: options.name ?? "screen-activity",
    out: options.out ?? "runs",
    recorder: !options["no-recorder"],
    recorderKind: options.recorder ?? "native-macos",
    preflight: !options["skip-permission-check"],
    requestPermissions: Boolean(options["request-permissions"])
  });
  return { session_id: session.id, session };
}

async function permissionsCheck() {
  return { permissions: await checkNativeMacOSPermissions({ request: false }) };
}

async function permissionsRequest() {
  return { permissions: await checkNativeMacOSPermissions({ request: true }) };
}

async function recordStop(args) {
  const options = parseOptions(args);
  const session = await stopSession({ sessionId: options._[0] ?? "latest", out: options.out ?? "runs" });
  return { session_id: session.id, session };
}

async function sessionList(args) {
  const options = parseOptions(args);
  return { sessions: await listSessions(options.out ?? "runs") };
}

async function sessionInspect(args) {
  const options = parseOptions(args);
  return { session: await getSession(options._[0] ?? "latest", options.out ?? "runs") };
}

async function sessionEvents(args) {
  const options = parseOptions(args);
  const session = await getSession(options._[0] ?? "latest", options.out ?? "runs");
  return { session_id: session.id, events: await readEvents(session.artifacts.events_path) };
}

async function sessionValidateRecording(args) {
  const options = parseOptions(args);
  const session = await getSession(options._[0] ?? "latest", options.out ?? "runs");
  return {
    session_id: session.id,
    events_path: session.artifacts.events_path,
    official_record_replay_contract: await validateOfficialRecordingContract({ session })
  };
}

async function qualitySources() {
  return { sources: await listQualitySources() };
}

async function qualityCompare(args) {
  const options = parseOptions(args);
  const sourceId = options.source ?? "feishu-file-send";
  let eventsPath = options.events;
  if (!eventsPath) {
    const session = await getSession(options._[0] ?? "latest", options.out ?? "runs");
    eventsPath = session.artifacts.events_path;
  }
  return await compareRecordingToSource({ eventsPath, sourceId });
}

async function skillPrepare(args) {
  const options = parseOptions(args);
  return await prepareSkillEvidencePackage({
    sessionId: options._[0] ?? "latest",
    runs: options.runs ?? "runs",
    out: options.out ?? "skill-inputs"
  });
}

async function workflowCompile(args) {
  const options = parseOptions(args);
  const session = await getSession(options._[0] ?? "latest", options.runs ?? "runs");
  const { workflow, workflowPath } = await compileWorkflow({
    session,
    out: options.out ?? "workflows",
    query: options.query ?? "study jazz music"
  });
  return { workflow_path: workflowPath, workflow };
}

async function workflowValidate(args) {
  const options = parseOptions(args);
  const workflow = await readWorkflow(options._[0]);
  return validateWorkflowWithWarnings(workflow);
}

async function workflowReplay(args) {
  const options = parseOptions(args);
  const workflow = await readWorkflow(options._[0]);
  const variables = parseVariables(options.var);
  const { trace, tracePath } = await replayWorkflow({
    workflow,
    variables,
    execute: Boolean(options.execute),
    out: options.out ?? "runs"
  });
  return { trace_path: tracePath, trace };
}

async function redaction(args) {
  const options = parseOptions(args);
  const input = options._.length ? options._.join(" ") : await readStdin();
  return redactionPreview(input);
}

async function demoYouTube(args) {
  const options = parseOptions(args);
  const runs = options.out ?? "runs";
  const query = options.query ?? "study jazz music";
  const session = await createSession({ name: "youtube-play-music", out: runs, recorder: true, recorderKind: options.recorder ?? "native-macos" });
  const { workflow } = await compileWorkflow({ session, out: path.join(runs, "workflows"), query });
  const liveReplay = await replayWorkflow({ workflow, variables: { query }, execute: true, out: runs });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const stopped = await stopSession({ sessionId: session.id, out: runs });
  const compiled = await compileWorkflow({ session: stopped, out: path.join(runs, "workflows"), query });
  return {
    session_id: stopped.id,
    events_path: stopped.artifacts.events_path,
    live_trace_path: liveReplay.tracePath,
    workflow_path: compiled.workflowPath,
    replay_status: liveReplay.trace.status
  };
}

async function readWorkflow(file) {
  if (!file) throw new Error("workflow path is required");
  const resolved = path.resolve(process.cwd(), file);
  if (!existsSync(resolved)) throw new Error(`Workflow not found: ${file}`);
  return readJson(resolved);
}

function parseVariables(values = []) {
  const variables = {};
  const entries = Array.isArray(values) ? values : [values];
  for (const entry of entries.filter(Boolean)) {
    const [key, ...rest] = String(entry).split("=");
    variables[key] = rest.join("=");
  }
  return variables;
}

function parseOptions(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["execute", "no-recorder", "skip-permission-check", "request-permissions"].includes(key)) {
      parsed[key] = true;
      continue;
    }
    const value = args[index + 1];
    index += 1;
    if (parsed[key] === undefined) parsed[key] = value;
    else if (Array.isArray(parsed[key])) parsed[key].push(value);
    else parsed[key] = [parsed[key], value];
  }
  return parsed;
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printHelp() {
  console.log(`Open Record/Replay CLI

Commands:
  orr permissions check
  orr permissions request
  orr record start --name screen-activity --out runs/ [--recorder native-macos|screen|chrome-youtube] [--request-permissions]
  orr record stop [session-id]
  orr session list
  orr session inspect [session-id]
  orr session events [session-id]
  orr session validate-recording [session-id]
  orr workflow compile [session-id] --runs runs/ --out workflows/ --query "study jazz music"
  orr workflow validate <workflow.json>
  orr workflow replay <workflow.json> --var query="study jazz music" [--execute]
  orr redaction preview <text>
  orr quality sources
  orr quality compare [session-id] --source feishu-file-send|youtube-play-video [--events events.jsonl]
  orr skill prepare [session-id] --runs runs/ --out skill-inputs/
  orr demo youtube --out runs/ --query "study jazz music"
`);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
