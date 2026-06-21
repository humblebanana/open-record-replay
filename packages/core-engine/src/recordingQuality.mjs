import path from "node:path";
import { readEvents, readJson } from "./store.mjs";

const REGISTRY_PATH = "fixtures/source-of-truth/registry.json";

export async function listQualitySources({ cwd = process.cwd() } = {}) {
  const registry = await readJson(path.resolve(cwd, REGISTRY_PATH));
  const sources = [];
  for (const source of registry.sources ?? []) {
    const eventsPath = path.resolve(cwd, source.eventsPath);
    const sessionPath = path.resolve(cwd, source.sessionPath);
    const events = await readEvents(eventsPath);
    sources.push({
      ...source,
      sessionPath,
      eventsPath,
      profile: profileRecording(events)
    });
  }
  return sources;
}

export async function getQualitySource(id, { cwd = process.cwd() } = {}) {
  const sources = await listQualitySources({ cwd });
  const source = sources.find((item) => item.id === id);
  if (!source) throw new Error(`Unknown quality source: ${id}`);
  return source;
}

export async function compareRecordingToSource({ eventsPath, sourceId, cwd = process.cwd() }) {
  if (!eventsPath) throw new Error("eventsPath is required");
  const source = await getQualitySource(sourceId, { cwd });
  const candidateEvents = await readEvents(eventsPath);
  const candidate = profileRecording(candidateEvents);
  return {
    source: {
      id: source.id,
      name: source.name,
      eventsPath: source.eventsPath,
      profile: source.profile
    },
    candidate: {
      eventsPath,
      profile: candidate
    },
    comparison: compareProfiles(candidate, source.profile)
  };
}

export function profileRecording(events) {
  const axEvents = events.filter((event) => event.ax?.text);
  const mouseTargetEvents = events.filter((event) => event.mouse?.target);
  const mouseSpecificTargetEvents = mouseTargetEvents.filter((event) => hasSemanticTarget(event.mouse.target));
  const dragOriginDestinationEvents = events.filter((event) => (
    event.kind === "mouse.drag" &&
    event.mouse?.origin &&
    event.mouse?.destination
  ));
  const selectionEvents = events.filter((event) => event.kind === "selection.changed");
  const selectedItems = selectionEvents.flatMap((event) => event.selection?.selectedItems ?? []);
  const richSelectedItems = selectedItems.filter(hasSemanticTarget);
  const keyboardEvents = events.filter((event) => event.kind?.startsWith("keyboard."));
  const keyboardTargetEvents = keyboardEvents.filter((event) => hasNonEmpty(event.keyboard?.target));
  const textEvents = events.filter((event) => event.kind === "keyboard.text_input");
  const screenshotEvents = events.filter((event) => event.kind === "screen.screenshot" || event.kind === "screenshot.captured");

  return {
    event_count: events.length,
    event_counts: countKinds(events),
    app_names: unique(events.map((event) => event.app?.name).filter(Boolean)),
    window_titles: unique(events.map((event) => event.window?.title).filter(Boolean)),
    ax_event_count: axEvents.length,
    ax_text_chars: axEvents.reduce((total, event) => total + event.ax.text.length, 0),
    mouse_target_event_count: mouseTargetEvents.length,
    mouse_specific_target_event_count: mouseSpecificTargetEvents.length,
    drag_origin_destination_event_count: dragOriginDestinationEvents.length,
    selection_event_count: selectionEvents.length,
    selected_item_count: selectedItems.length,
    rich_selected_item_count: richSelectedItems.length,
    keyboard_event_count: keyboardEvents.length,
    keyboard_target_event_count: keyboardTargetEvents.length,
    keyboard_text_event_count: textEvents.length,
    keyboard_text_total_chars: textEvents.reduce((total, event) => total + String(event.keyboard?.text ?? "").length, 0),
    screenshot_event_count: screenshotEvents.length
  };
}

export function compareProfiles(candidate, source) {
  const checks = [
    ratioCheck("ax_text_chars", candidate.ax_text_chars, source.ax_text_chars, 0.7),
    ratioCheck("mouse_target_event_count", candidate.mouse_target_event_count, source.mouse_target_event_count, 1),
    ratioCheck("mouse_specific_target_event_count", candidate.mouse_specific_target_event_count, source.mouse_specific_target_event_count, 0.75),
    ratioCheck("selection_event_count", candidate.selection_event_count, source.selection_event_count, 0.6),
    ratioCheck("rich_selected_item_count", candidate.rich_selected_item_count, source.rich_selected_item_count, 1),
    ratioCheck("keyboard_target_event_count", candidate.keyboard_target_event_count, source.keyboard_target_event_count, 1),
    countAtLeastCheck("drag_origin_destination_event_count", candidate.drag_origin_destination_event_count, source.drag_origin_destination_event_count)
  ];

  const candidateKindSet = new Set(Object.keys(candidate.event_counts));
  const missingEventKinds = Object.keys(source.event_counts).filter((kind) => !candidateKindSet.has(kind));
  for (const kind of missingEventKinds) {
    checks.push({
      metric: `event_kind:${kind}`,
      status: "failed",
      candidate: 0,
      source: source.event_counts[kind],
      message: `Candidate is missing source event kind ${kind}.`
    });
  }

  return {
    status: checks.some((check) => check.status === "failed") ? "failed" : "passed",
    checks
  };
}

function ratioCheck(metric, candidate, source, minimumRatio) {
  if (source === 0) {
    return {
      metric,
      status: "passed",
      candidate,
      source,
      ratio: null,
      minimum_ratio: minimumRatio
    };
  }
  const ratio = candidate / source;
  return {
    metric,
    status: ratio >= minimumRatio ? "passed" : "failed",
    candidate,
    source,
    ratio,
    minimum_ratio: minimumRatio
  };
}

function countAtLeastCheck(metric, candidate, source) {
  return {
    metric,
    status: candidate >= source ? "passed" : "failed",
    candidate,
    source,
    message: candidate >= source ? undefined : `Candidate must capture at least ${source} ${metric}.`
  };
}

function hasSemanticTarget(target) {
  if (!hasNonEmpty(target)) return false;
  return ["title", "description", "identifier", "value", "path", "local_ax"].some((key) => hasNonEmpty(target[key]));
}

function hasNonEmpty(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function countKinds(events) {
  const counts = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] || 0) + 1;
  return counts;
}

function unique(values) {
  return [...new Set(values)];
}
